import {Caller} from "./caller";
import {ChannelRole} from "@aws-sdk/client-kinesis-video";
import LOG from '../Logger';

export default class Master extends Caller {

    dataChannelByClientId = {};

    constructor(config) {
        super(config);
        this.selector = this.selector.bind(this);
        this.addIceCandidate = this.addIceCandidate.bind(this);
        this.onSignalingClientClose = this.onSignalingClientClose.bind(this);
        this.onSignalingClientError = this.onSignalingClientError.bind(this);
    }

    start() {
        LOG.log('[MASTER] Starting master connection');
        super.start().then((result) => {
            if (this.config.sendVideo || this.config.sendAudio) {
                LOG.debug('[MASTER] Devices', navigator.mediaDevices);
                navigator.mediaDevices.getUserMedia(this.constraints)
                    .then(stream => {
                        LOG.debug('[MASTER] Local view stream', stream);
                        this.localStream = stream;
                        const localView = document.getElementById(this.config.localViewId);
                        localView.srcObject = stream;
                        localView.onloadedmetadata = function (e) {
                            LOG.debug('[MASTER] Metadata loaded', e);
                            localView.play();
                            LOG.debug('[MASTER] Play...');
                        }
                    })
            }
            this.signalingClient.on('open', async () => {
                LOG.log('[MASTER] Connected to signaling service');
            });
            this.signalingClient.on('sdpOffer', this.selector);
            this.signalingClient.on('iceCandidate', this.addIceCandidate);
            this.signalingClient.on('close', this.onSignalingClientClose);
            this.signalingClient.on('error', this.onSignalingClientError);
            this.signalingClient.open();
        });
    }

    async selector(offer, remoteClientId) {
        LOG.log('[MASTER] Received SDP offer from client: ' + remoteClientId);
        // Create a new peer connection using the offer from the given client
        this.peerConnection = new RTCPeerConnection(this.configuration);
        LOG.debug(`[MASTER] RTC peer connection:`, this.peerConnection);

        this.peerConnectionByClientId[remoteClientId] = this.peerConnection;

        if (this.config.openDataChannel) {
            this.dataChannelByClientId[remoteClientId] = this.peerConnection.createDataChannel('kvsDataChannel');
            this.peerConnection.ondatachannel = event => {
                event.channel.onmessage = this.onRemoteDataMessage;
            };
        }

        // Poll for connection stats
        if (!this.peerConnectionStatsInterval) {
            this.peerConnectionStatsInterval = setInterval(
                () => {
                    LOG.log('[MASTER] Read...');
                    this.peerConnection.getStats().then(this.onStatisticReport);
                }, 1000);
        }

        // Send any ICE candidates to the other peer
        this.peerConnection.addEventListener('icecandidate', ({candidate}) => {
            if (candidate) {
                LOG.log('[MASTER] Generated ICE candidate for client:', remoteClientId);

                // When trickle ICE is enabled, send the ICE candidates as they are generated.
                if (this.config.useTrickleICE) {
                    LOG.log('[MASTER] Sending ICE candidate to client: ', remoteClientId);
                    this.signalingClient.sendIceCandidate(candidate, remoteClientId);
                }
            } else {
                LOG.log('[MASTER] All ICE candidates have been generated for client: ', remoteClientId);

                // When trickle ICE is disabled, send the answer now that all the ICE candidates have ben generated.
                if (!this.config.useTrickleICE) {
                    LOG.log('[MASTER] Sending SDP answer to client: ' + remoteClientId);
                    this.signalingClient.sendSdpAnswer(this.peerConnection.localDescription, remoteClientId);
                }
            }
        });

        // As remote tracks are received, add them to the remote view
        this.peerConnection.addEventListener('track', event => {
            LOG.log('[MASTER] Received remote track from client: ' + remoteClientId);
            const remoteView = document.getElementById(this.config.remoteViewId);
            if (remoteView.srcObject) {
                return;
            }
            remoteView.srcObject = event.streams[0];
        });

        // If there's no video/audio, master.localStream will be null. So, we should skip adding the tracks from it.
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => this.peerConnection.addTrack(track, this.localStream));
        }
        await this.peerConnection.setRemoteDescription(offer);

        // Create an SDP answer to send back to the client
        LOG.log('[MASTER] Creating SDP answer for client: ' + remoteClientId);
        await this.peerConnection.setLocalDescription(
            await this.peerConnection.createAnswer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true,
            }),
        );

        // When trickle ICE is enabled, send the answer now and then send ICE candidates as they are generated. Otherwise wait on the ICE candidates.
        if (this.config.useTrickleICE) {
            LOG.log('[MASTER] Sending SDP answer to client: ' + remoteClientId);
            this.signalingClient.sendSdpAnswer(this.peerConnection.localDescription, remoteClientId);
        }
        LOG.log('[MASTER] Generating ICE candidates for client: ' + remoteClientId);
    }

    onSignalingClientError() {
        LOG.error('[MASTER] Signaling client error', arguments);
    }

    onSignalingClientClose() {
        LOG.log('[MASTER] Disconnected from signaling channel', arguments);
    }

    async addIceCandidate(candidate, remoteClientId) {
        LOG.log('[MASTER] Received ICE candidate from client:', candidate, remoteClientId);
        // Add the ICE candidate received from the client to the peer connection
        const peerConnection = this.peerConnectionByClientId[remoteClientId];
        LOG.debug('[MASTER] Peer connection:', peerConnection);
        try {
            peerConnection.addIceCandidate(candidate).then(value => LOG.log('[MASTER] ICE candidate added', value));
        } catch(error) {
            LOG.error('[MASTER] add ICE candidate failed', error);
            throw error;
        }
    }

    stop() {
        LOG.log('[MASTER] Stopping master connection');
        if (this.signalingClient) {
            this.signalingClient.close();
            this.signalingClient = null;
        }

        Object.keys(this.peerConnectionByClientId).forEach(clientId => {
            this.peerConnectionByClientId[clientId].close();
        });
        this.peerConnectionByClientId = [];

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        this.remoteStreams.forEach(remoteStream => remoteStream.getTracks().forEach(track => track.stop()));
        this.remoteStreams = [];

        if (this.peerConnectionStatsInterval) {
            clearInterval(this.peerConnectionStatsInterval);
            this.peerConnectionStatsInterval = null;
        }

        const localView = document.getElementById(this.config.localViewId);
        if (localView) {
            localView.srcObject = null;
        }
        const remoteView = document.getElementById(this.config.remoteViewId);
        if (remoteView) {
            remoteView.srcObject = null;
        }

        if (this.dataChannelByClientId) {
            this.dataChannelByClientId = {};
        }
    }

    sendMessage(message) {
        Object.keys(this.dataChannelByClientId).forEach(clientId => {
            try {
                this.dataChannelByClientId[clientId].send(message);
            } catch (e) {
                LOG.error('[MASTER] Send DataChannel: ', e.toString());
            }
        });
    }

    getRole() {
        return ChannelRole.MASTER;
    }
}
