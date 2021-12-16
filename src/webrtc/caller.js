import {ChannelProtocol, KinesisVideo} from "@aws-sdk/client-kinesis-video";
import {SignalingClient} from "amazon-kinesis-video-streams-webrtc";
import {KinesisVideoSignaling} from "@aws-sdk/client-kinesis-video-signaling";
import awsconfig from '../aws-exports';
import LOG from '../Logger';
import {fromCognitoIdentityPool} from "@aws-sdk/credential-providers";
import {CognitoIdentityClient} from "@aws-sdk/client-cognito-identity";

const Config = {
    credentials: null,
    region: process.env.REGION || awsconfig.aws_project_region,
    endpoint: null,
    ChannelName: 'RendezVousChannel',
    natTraversalDisabled: false,
    forceTURN: true,
    widescreen: true,
    sendVideo: true,
    sendAudio: true,
    openDataChannel: false,
    useTrickleICE: true,
    localView: null,
    remoteView: null,
    clientId: null
}

class RendezVousError extends Error {
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = 'RendezVousError';
    }
}

class Caller {
    config;
    configuration;
    peerConnectionByClientId = {}
    remoteStreams = []
    onStatisticReport = (report) => {LOG.log(report)};
    onRemoteDataMessage = (channel, event) => {LOG.log(channel, event)};
    kinesisVideoClient = null;
    signalingClient;
    constraints = {audio: true, video: true};
    ChannelARN;
    peerConnection;
    localStream;
    peerConnectionStatsInterval;

    constructor(config) {
        this.config = config;
    }

    async start() {
        try {
            const region = awsconfig.aws_project_region;
            const identityPoolId = awsconfig.aws_cognito_identity_pool_id;
            LOG.debug("Region: ", region);
            LOG.debug("Identity pool id: ", identityPoolId);

            const credentialsFromPool = fromCognitoIdentityPool(
                {
                    identityPoolId,
                    clientConfig: { region }
                }
            );
            LOG.debug("Credentials from Pool", credentialsFromPool);
            const configuration = {...Config, ...{credentials: credentialsFromPool}};
            LOG.debug("Configuration", configuration);
            this.kinesisVideoClient = new KinesisVideo(configuration);
            const ChannelARN = await this.getChannelARN();
            this.ChannelARN = ChannelARN;
            LOG.log(`[${this.getRole()}] Channel ARN: `, ChannelARN);
            const getSignalingChannelEndpointResponse = await this.kinesisVideoClient.getSignalingChannelEndpoint({
                ChannelARN,
                SingleMasterChannelEndpointConfiguration: {
                    Protocols: [ChannelProtocol.HTTPS, ChannelProtocol.WSS],
                    Role: this.getRole()
                }
            });

            LOG.debug('Get signaling channel endpoint response', getSignalingChannelEndpointResponse);
            const endpointsByProtocol = getSignalingChannelEndpointResponse.ResourceEndpointList.reduce(
                (endpoints, endpoint) => {
                    endpoints[endpoint.Protocol] = endpoint.ResourceEndpoint;

                    return endpoints;
                }, {});
            LOG.log(`[${this.getRole()}] Endpoints: `, endpointsByProtocol);
            this.signalingClient = await this.getSignalingClient(endpointsByProtocol);
            const iceServers = await this.getIceServers(endpointsByProtocol);
            this.configuration = {
                iceServers,
                iceTransportPolicy: this.config.forceTURN ? 'relay' : 'all',
            };
            const resolution = this.config.widescreen ?
                {
                    width: {
                        ideal: 1280
                    },
                    height: {
                        ideal: 720
                    }
                } : {
                    width: {
                        ideal: 640
                    },
                    height: {
                        ideal: 480
                    }
                };

            this.constraints = {
                video: this.config.sendVideo ? resolution : false,
                audio: this.config.sendAudio,
            };
            // Create a new peer connection using the offer from the given client
            this.peerConnection = new RTCPeerConnection(this.configuration);
        } catch(error) {
            LOG.error('Caller start error: ', error, error.stack);
        }
    }

    async getIceServers(endpointsByProtocol) {
        // Get ICE server configuration
        const kinesisVideoSignalingChannelsClient = new KinesisVideoSignaling({
            region: this.config.region,
            credentials: fromCognitoIdentityPool(
                {
                    clientConfig: { region: awsconfig.aws_project_region },
                    identityPoolId: awsconfig.aws_cognito_identity_pool_id
                }
            ),
            endpoint: endpointsByProtocol.Protocol.HTTPS
        });
        const ChannelARN = this.ChannelARN;
        const getIceServerConfigResponse = await kinesisVideoSignalingChannelsClient.getIceServerConfig({ChannelARN})
        const iceServers = [];
        if (!this.config.natTraversalDisabled && !this.config.forceTURN) {
            iceServers.push({ urls: `stun:stun.kinesisvideo.${this.config.region}.amazonaws.com:443` });
        }
        if (!this.config.natTraversalDisabled) {
            getIceServerConfigResponse.IceServerList.forEach(iceServer =>
                iceServers.push({
                    urls: iceServer.Uris,
                    username: iceServer.Username,
                    credential: iceServer.Password,
                }),
            );
        }
        LOG.log(`[${this.getRole()}] ICE servers: `, iceServers);
    }

    async getSignalingClient(endpointsByProtocol) {
        const ChannelARN = this.ChannelARN;
        // Create Signaling Client
        const signalingClient = new SignalingClient({
            ChannelARN,
            channelEndpoint: endpointsByProtocol.Protocol.WSS,
            role: this.getRole(),
            region: this.config.region,
            credentials: fromCognitoIdentityPool(
                {
                    clientConfig: { region: awsconfig.aws_project_region },
                    identityPoolId: awsconfig.aws_cognito_identity_pool_id
                }
            ),
            systemClockOffset: this.config.systemClockOffset,
            clientId: this.config.clientId
        });

        return signalingClient;
    }

    getRole() {
        throw new Error('Not implemented');
    }

    async getChannelARN() {
        // Get signaling channel ARN
        LOG.debug('Get channel ARN');
        const describeSignalingChannelResponse =
            await this.kinesisVideoClient.describeSignalingChannel({ChannelName: this.config.ChannelName});

            LOG.debug('Signaling channel: ', describeSignalingChannelResponse);

        const ChannelARN = describeSignalingChannelResponse.ChannelInfo.ChannelARN;

        return ChannelARN;
    }
}

export {
    Config,
    RendezVousError,
    Caller
};