import {Caller} from "./caller";
import {ChannelRole} from "@aws-sdk/client-kinesis-video";
import LOG from '../Logger';

export default class Master extends Caller {

    dataChannelByClientId;

    start() {
        //super.start().then(result => LOG.log(result)).catch(reason => LOG.log('---', reason));
        super.start().then(async (result) => {
            if (this.config.sendVideo || this.config.sendAudio) {
                this.localStream = await navigator.mediaDevices.getUserMedia(super.constraints);
                this.config.localView.srcObject = this.localStream;
            }
            this.signalingClient.on('open', async () => {
                LOG.log('[MASTER] Connected to signaling service');
            });
            this.signalingClient.on('sdpOffer', this.selector);
        });
    }

    async selector(offer, remoteClientId) {
        LOG.log('[MASTER] Received SDP offer from client: ' + remoteClientId);

        this.peerConnectionByClientId[remoteClientId] = super.peerConnection;

        if (this.config.openDataChannel) {
            this.dataChannelByClientId[remoteClientId] = super.peerConnection.createDataChannel('kvsDataChannel');
            super.peerConnection.ondatachannel = event => {
                event.channel.onmessage = this.onRemoteDataMessage;
            };
        }

        // Poll for connection stats
        if (!this.peerConnectionStatsInterval) {
            this.peerConnectionStatsInterval = setInterval(
                () => {
                    LOG.log('Read...');
                    super.peerConnection.getStats().then(this.onStatisticReport);
                }, 1000);
        }

        // Send any ICE candidates to the other peer
        super.peerConnection.addEventListener('icecandidate', ({candidate}) => {
            if (candidate) {
                LOG.log('[MASTER] Generated ICE candidate for client: ' + remoteClientId);

                // When trickle ICE is enabled, send the ICE candidates as they are generated.
                if (this.config.useTrickleICE) {
                    LOG.log('[MASTER] Sending ICE candidate to client: ' + remoteClientId);
                    this.signalingClient.sendIceCandidate(candidate, remoteClientId);
                }
            } else {
                LOG.log('[MASTER] All ICE candidates have been generated for client: ' + remoteClientId);

                // When trickle ICE is disabled, send the answer now that all the ICE candidates have ben generated.
                if (!this.config.useTrickleICE) {
                    LOG.log('[MASTER] Sending SDP answer to client: ' + remoteClientId);
                    this.signalingClient.sendSdpAnswer(super.peerConnection.localDescription, remoteClientId);
                }
            }
        });

        // As remote tracks are received, add them to the remote view
        super.peerConnection.addEventListener('track', event => {
            LOG.log('[MASTER] Received remote track from client: ' + remoteClientId);
            if (this.config.remoteView.srcObject) {
                return;
            }
            this.config.remoteView.srcObject = event.streams[0];
        });

        // If there's no video/audio, master.localStream will be null. So, we should skip adding the tracks from it.
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => super.peerConnection.addTrack(track, this.localStream));
        }
        await super.peerConnection.setRemoteDescription(offer);

        // Create an SDP answer to send back to the client
        LOG.log('[MASTER] Creating SDP answer for client: ' + remoteClientId);
        await super.peerConnection.setLocalDescription(
            await super.peerConnection.createAnswer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true,
            }),
        );

        // When trickle ICE is enabled, send the answer now and then send ICE candidates as they are generated. Otherwise wait on the ICE candidates.
        if (this.config.useTrickleICE) {
            LOG.log('[MASTER] Sending SDP answer to client: ' + remoteClientId);
            this.signalingClient.sendSdpAnswer(super.peerConnection.localDescription, remoteClientId);
        }
        LOG.log('[MASTER] Generating ICE candidates for client: ' + remoteClientId);
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

        if (this.config.localView) {
            this.config.localView.srcObject = null;
        }

        if (this.config.remoteView) {
            this.config.remoteView.srcObject = null;
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
