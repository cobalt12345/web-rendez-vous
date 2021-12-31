import {ChannelProtocol, KinesisVideo} from "@aws-sdk/client-kinesis-video";
import {SignalingClient} from "amazon-kinesis-video-streams-webrtc";
import {KinesisVideoSignaling} from "@aws-sdk/client-kinesis-video-signaling";
import awsconfig from '../aws-exports';
import LOG from '../Logger';

//Only one of next three options can be enabled.
//natTraversalEnabled - STUN/TURN
//forceTURN - TURN Only force cloud relay
//natTraversalDisabled - Disabled

//useTrickleICE

const TRAVERSAL = {
        STUN_TURN: 'stunTurn',
        TURN_ONLY: 'turnOnly',
        DISABLED: 'disabled'
};

const Config = {
    credentials: null,
    region: process.env.REGION || awsconfig.aws_project_region,
    endpoint: null,
    ChannelName: 'RendezVousChannel',
    natTraversal: TRAVERSAL.STUN_TURN,
    widescreen: true,
    sendVideo: true,
    sendAudio: true,
    openDataChannel: true,
    useTrickleICE: true,
    clientId: null, //getRandomClientId() - otherwise error
    correctClockSkew: true,
    systemClockOffset: 0,
    localView: null,
    remoteView: null
}

class Caller {
    config;
    configuration;
    peerConnectionByClientId = {}
    onStatisticReport = (report) => {LOG.log(`[${this.getRole()}] onStatisticReport`, Object.entries(report))};
    onRemoteDataMessage = (channel, event) => {
        LOG.log(`[${this.getRole()}] onRemoteDataMessage`, channel, event);
    };
    kinesisVideoClient = null;
    signalingClient;
    constraints;
    ChannelARN;
    localStream;
    peerConnectionStatsInterval;

    constructor(config) {
        this.config = config;
        this.setCredentials = this.setCredentials.bind(this);
        this.start = this.start.bind(this);
        this.stop = this.stop.bind(this);
        this.getIceServers = this.getIceServers.bind(this);
        this.getSignalingClient = this.getSignalingClient.bind(this);
        this.getChannelARN = this.getChannelARN.bind(this);

    }



    setCredentials(credentials) {
        this.config.credentials = credentials;
    }

    async start() {
        LOG.debug(`[${this.getRole()}] Configuration`, {...this.config, localView: null, remoteView: null});
        this.kinesisVideoClient = new KinesisVideo(this.config);
        const ChannelARN = await this.getChannelARN();
        this.ChannelARN = ChannelARN;
        LOG.log(`[${this.getRole()}] Channel ARN:`, ChannelARN);
        const getSignalingChannelEndpointResponse = await this.kinesisVideoClient.getSignalingChannelEndpoint({
            ChannelARN,
            SingleMasterChannelEndpointConfiguration: {
                Protocols: [ChannelProtocol.WSS, ChannelProtocol.HTTPS],
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
            iceTransportPolicy: this.config.natTraversal === TRAVERSAL.TURN_ONLY ? 'relay' : 'all',
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
            audio: this.config.sendAudio ? {'echoCancellation': true} : false
        };
        LOG.debug(`[${this.getRole()}] Audio/video constraints:`, this.constraints);
    }

    stop() {
        if (this.peerConnectionStatsInterval) {
            clearInterval(this.peerConnectionStatsInterval);
            this.peerConnectionStatsInterval = null;
        }

        const localView = this.config.localView.current;
        if (localView) {
            localView.srcObject = null;
        }
        const remoteView = this.config.remoteView.current;
        if (remoteView) {
            remoteView.srcObject = null;
        }
    }

    async getIceServers(endpointsByProtocol) {
        // Get ICE server configuration
        const kinesisVideoSignalingChannelsClient = new KinesisVideoSignaling({
            region: this.config.region,
            credentials: {
                accessKeyId: this.config.credentials.accessKeyId,
                secretAccessKey: this.config.credentials.secretAccessKey,
                sessionToken: this.config.credentials.sessionToken
            },
            endpoint: endpointsByProtocol[ChannelProtocol.HTTPS]
        });
        const ChannelARN = this.ChannelARN;
        const getIceServerConfigResponse = await kinesisVideoSignalingChannelsClient.getIceServerConfig({ChannelARN})
        const iceServers = [];
        if (!this.config.natTraversal === TRAVERSAL.STUN_TURN) {
            iceServers.push({ urls: `stun:stun.kinesisvideo.${this.config.region}.amazonaws.com:443` });
        }
        if (!this.config.natTraversal !== TRAVERSAL.DISABLED) {
            getIceServerConfigResponse.IceServerList.forEach(iceServer =>
                iceServers.push({
                    urls: iceServer.Uris,
                    username: iceServer.Username,
                    credential: iceServer.Password,
                }),
            );
        }
        LOG.log(`[${this.getRole()}] ICE servers: `, iceServers);

        return iceServers;
    }

    async getSignalingClient(endpointsByProtocol) {
        LOG.debug(`[${this.getRole()}] Create signaling client with channel ARN:`, this.ChannelARN);
        // Create Signaling Client
        const signalingClient = new SignalingClient({
            channelARN: this.ChannelARN,
            channelEndpoint: endpointsByProtocol[ChannelProtocol.WSS],
            role: this.getRole(),
            region: this.config.region,
            credentials: {
                accessKeyId: this.config.credentials.accessKeyId,
                secretAccessKey: this.config.credentials.secretAccessKey,
                sessionToken: this.config.credentials.sessionToken
            },
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
