import {ChannelProtocol, ChannelRole, KinesisVideo} from "@aws-sdk/client-kinesis-video";
import {SignalingClient} from "amazon-kinesis-video-streams-webrtc";
import {KinesisVideoSignaling} from "@aws-sdk/client-kinesis-video-signaling";

export const Config = {
    credentials: {
        AccessKeyId:        undefined,
        Expiration:         undefined,
        SecretAccessKey:    undefined,
        SessionToken:       undefined
    },
    region: null,
    endpoint: null,
    ChannelName: null,
    natTraversalDisabled: null,
    forceTURN: null,
    widescreen: true,
    sendVideo: true,
    sendAudio: true,
    openDataChannel: null,
    useTrickleICE: null
}

export class Master {
    #configuration;
    #peerConnectionByClientId = {}
    #dataChannelByClientId = {}
    #peerConnectionStatsInterval = null
    #remoteStreams = []
    onStatisticReport = (report) => {console.log(report)};
    onRemoteDataMessage = (channel, event) => {console.log(channel, event)};

    async constructor(config) {
        this.config = config;
        this.kinesisVideoClient = new KinesisVideo(this.config);
        try {
            // Get signaling channel ARN
            const describeSignalingChannelResponse =
                await this.kinesisVideoClient.describeSignalingChannel({ChannelName: config.ChannelName});

            const ChannelARN = describeSignalingChannelResponse.ChannelInfo.ChannelARN;
            console.log('[MASTER] Channel ARN: ', ChannelARN);

            const getSignalingChannelEndpointResponse = await this.kinesisVideoClient.getSignalingChannelEndpoint({
                ChannelARN,
                SingleMasterChannelEndpointConfiguration: {
                    Protocols: [ChannelProtocol.HTTPS, ChannelProtocol.WSS],
                    Role: ChannelRole.MASTER
                }
            });
            const endpointsByProtocol = getSignalingChannelEndpointResponse.ResourceEndpointList.reduce(
                (endpoints, endpoint) => {
                    endpoints[endpoint.Protocol] = endpoint.ResourceEndpoint;

                    return endpoints;
                }, {});
            console.log('[MASTER] Endpoints: ', endpointsByProtocol);
            // Create Signaling Client
            this.signalingClient = new SignalingClient({
                ChannelARN,
                channelEndpoint: endpointsByProtocol.Protocol.WSS,
                role: ChannelRole.MASTER,
                region: this.config.region,
                credentials: this.config.credentials,
                systemClockOffset: this.config.systemClockOffset
            });
            // Get ICE server configuration
            const kinesisVideoSignalingChannelsClient = new KinesisVideoSignaling({
                region: this.config.region,
                credentials: this.config.credentials,
                endpoint: endpointsByProtocol.Protocol.HTTPS
            });
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
            console.log('[MASTER] ICE servers: ', iceServers);
            this.#configuration = {
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

            const constraints = {
                video: this.config.sendVideo ? resolution : false,
                audio: this.config.sendAudio,
            };

            if (this.config.sendVideo || this.config.sendAudio) {
                this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
                this._localView.srcObject = this.localStream;
            }
            this.signalingClient.on('open', async () => {
                console.log('[MASTER] Connected to signaling service');
            });
            this.signalingClient.on('sdpOffer', this.#selector);

        } catch(ex) {
            console.error(ex);

            throw ex;
        }
    }

    async #selector(offer, remoteClientId) {
        console.log('[MASTER] Received SDP offer from client: ' + remoteClientId);

        // Create a new peer connection using the offer from the given client
        const peerConnection = new RTCPeerConnection(this.#configuration);
        this.#peerConnectionByClientId[remoteClientId] = peerConnection;

        if (this.config.openDataChannel) {
            this.#dataChannelByClientId[remoteClientId] = peerConnection.createDataChannel('kvsDataChannel');
            peerConnection.ondatachannel = event => {
                event.channel.onmessage = this.onRemoteDataMessage;
            };
        }

        // Poll for connection stats
        if (!this.#peerConnectionStatsInterval) {
            this.#peerConnectionStatsInterval = setInterval(
                () => peerConnection.getStats().then(this.onStatisticReport), 1000);
        }

        // Send any ICE candidates to the other peer
        peerConnection.addEventListener('icecandidate', ({candidate}) => {
            if (candidate) {
                console.log('[MASTER] Generated ICE candidate for client: ' + remoteClientId);

                // When trickle ICE is enabled, send the ICE candidates as they are generated.
                if (this.config.useTrickleICE) {
                    console.log('[MASTER] Sending ICE candidate to client: ' + remoteClientId);
                    this.signalingClient.sendIceCandidate(candidate, remoteClientId);
                }
            } else {
                console.log('[MASTER] All ICE candidates have been generated for client: ' + remoteClientId);

                // When trickle ICE is disabled, send the answer now that all the ICE candidates have ben generated.
                if (!this.config.useTrickleICE) {
                    console.log('[MASTER] Sending SDP answer to client: ' + remoteClientId);
                    this.signalingClient.sendSdpAnswer(peerConnection.localDescription, remoteClientId);
                }
            }
        });

        // As remote tracks are received, add them to the remote view
        peerConnection.addEventListener('track', event => {
            console.log('[MASTER] Received remote track from client: ' + remoteClientId);
            if (this._remoteView.srcObject) {
                return;
            }
            this._remoteView.srcObject = event.streams[0];
        });

        // If there's no video/audio, master.localStream will be null. So, we should skip adding the tracks from it.
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => peerConnection.addTrack(track, this.localStream));
        }
        await peerConnection.setRemoteDescription(offer);

        // Create an SDP answer to send back to the client
        console.log('[MASTER] Creating SDP answer for client: ' + remoteClientId);
        await peerConnection.setLocalDescription(
            await peerConnection.createAnswer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true,
            }),
        );

        // When trickle ICE is enabled, send the answer now and then send ICE candidates as they are generated. Otherwise wait on the ICE candidates.
        if (this.config.useTrickleICE) {
            console.log('[MASTER] Sending SDP answer to client: ' + remoteClientId);
            this.signalingClient.sendSdpAnswer(peerConnection.localDescription, remoteClientId);
        }
        console.log('[MASTER] Generating ICE candidates for client: ' + remoteClientId);
    }

    set localView(value) {
        this._localView = value;
    }

    get localView() {
        return this._localView;
    }

    set remoteView(value) {
        this._remoteView = value;
    }

    get remoteView() {
        return this._remoteView;
    }

    stop() {
        console.log('[MASTER] Stopping master connection');
        if (this.signalingClient) {
            this.signalingClient.close();
            this.signalingClient = null;
        }

        Object.keys(this.#peerConnectionByClientId).forEach(clientId => {
            this.#peerConnectionByClientId[clientId].close();
        });
        this.#peerConnectionByClientId = [];

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        this.#remoteStreams.forEach(remoteStream => remoteStream.getTracks().forEach(track => track.stop()));
        this.#remoteStreams = [];

        if (this.#peerConnectionStatsInterval) {
            clearInterval(this.#peerConnectionStatsInterval);
            this.#peerConnectionStatsInterval = null;
        }

        if (this._localView) {
            this._localView.srcObject = null;
        }

        if (this._remoteView) {
            this._remoteView.srcObject = null;
        }

        if (this.#dataChannelByClientId) {
            this.#dataChannelByClientId = {};
        }
    }

    sendMasterMessage(message) {
        Object.keys(this.#dataChannelByClientId).forEach(clientId => {
            try {
                this.#dataChannelByClientId[clientId].send(message);
            } catch (e) {
                console.error('[MASTER] Send DataChannel: ', e.toString());
            }
        });
    }
}
