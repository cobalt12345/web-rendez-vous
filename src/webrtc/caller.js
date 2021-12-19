import {ChannelProtocol, KinesisVideo} from "@aws-sdk/client-kinesis-video";
import {SignalingClient} from "amazon-kinesis-video-streams-webrtc";
import {KinesisVideoSignaling} from "@aws-sdk/client-kinesis-video-signaling";
import awsconfig from '../aws-exports';
import LOG from '../Logger';

const Config = {
    credentials: {
        SessionToken: null
    },
    region: process.env.REGION || awsconfig.aws_project_region,
    endpoint: null,
    ChannelName: 'RendezVousChannel',
    natTraversalDisabled: false,
    forceTURN: false,//true,
    widescreen: false,
    sendVideo: true,
    sendAudio: true,
    openDataChannel: false,
    useTrickleICE: true,
    localViewId: null,
    remoteViewId: null,
    clientId: null //getRandomClientId() - otherwise error
}

class Caller {
    config;
    configuration;
    peerConnectionByClientId = {}
    remoteStreams = []
    onStatisticReport = (report) => {LOG.log(`[${this.getRole()}] onStatisticReport`, report)};
    onRemoteDataMessage = (channel, event) => {LOG.log(`[${this.getRole()}] onRemoteDataMessage`, channel, event)};
    kinesisVideoClient = null;
    signalingClient;
    constraints;
    ChannelARN;
    peerConnection;
    localStream;
    peerConnectionStatsInterval;

    constructor(config) {
        this.config = config;
    }

    setCredentials(credentials) {
        this.config.credentials = credentials;
    }

    async start() {
        LOG.debug(`[${this.getRole()}] Configuration`, this.config);
        this.kinesisVideoClient = new KinesisVideo(this.config);
        const ChannelARN = await this.getChannelARN();
        this.ChannelARN = ChannelARN;
        LOG.log(`[${this.getRole()}] Channel ARN:`, ChannelARN);
        const getSignalingChannelEndpointResponse = await this.kinesisVideoClient.getSignalingChannelEndpoint({
            ChannelARN,
            SingleMasterChannelEndpointConfiguration: {
                Protocols: [ChannelProtocol.HTTPS, ChannelProtocol.WSS],
                Role: this.getRole()
            }
        });

        LOG.debug(`[${this.getRole()}] Get signaling channel endpoint response`, getSignalingChannelEndpointResponse);
        const endpointsByProtocol = getSignalingChannelEndpointResponse.ResourceEndpointList.reduce(
            (endpoints, endpoint) => {
                endpoints[endpoint.Protocol] = endpoint.ResourceEndpoint;

                return endpoints;
            }, {});
        LOG.log(`[${this.getRole()}] Endpoints:`, endpointsByProtocol);
        this.signalingClient = await this.getSignalingClient(endpointsByProtocol);
        const iceServers = await this.getIceServers(endpointsByProtocol);
        this.configuration = {
            iceServers,
            iceTransportPolicy: this.config.forceTURN ? 'relay' : 'all',
        };

        const resolution = this.config.widescreen ?
            {
                facingMode: "user",
                width: {
                    ideal: 1280
                },
                height: {
                    ideal: 720
                }
            } : {
                facingMode: "user",
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
        LOG.debug(`[${this.getRole()}] Audio/video constraints:`, this.constraints);
    }

    async getIceServers(endpointsByProtocol) {
        // Get ICE server configuration
        const kinesisVideoSignalingChannelsClient = new KinesisVideoSignaling({
            region: this.config.region,
            credentials: this.config.credentials,
            endpoint: endpointsByProtocol[ChannelProtocol.HTTPS]
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
        LOG.debug(`[${this.getRole()}] Create signaling client with channel ARN:`, this.ChannelARN);
        // Create Signaling Client
        const signalingClient = new SignalingClient({
            channelARN: this.ChannelARN,
            channelEndpoint: endpointsByProtocol[ChannelProtocol.WSS],
            role: this.getRole(),
            region: this.config.region,
            credentials: this.config.credentials,
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
        LOG.debug(`[${this.getRole()}] Get channel ARN for ` + this.config.ChannelName);
        const describeSignalingChannelResponse =
            await this.kinesisVideoClient.describeSignalingChannel({ChannelName: this.config.ChannelName});

            LOG.debug(`[${this.getRole()}]  Signaling channel:`, describeSignalingChannelResponse);

        const ChannelARN = describeSignalingChannelResponse.ChannelInfo.ChannelARN;

        return ChannelARN;
    }
}

export {
    Config,
    Caller
};
