import {Caller} from "./caller";
import {ChannelRole} from "@aws-sdk/client-kinesis-video";
import LOG from '../Logger';

export default class Viewer extends Caller {

    remoteStream;
    dataChannel;

    async onOpen() {
        LOG.log('[VIEWER] Connected to signaling service');

        // Get a stream from the webcam, add it to the peer connection, and display it in the local view.
        // If no video/audio needed, no need to request for the sources.
        // Otherwise, the browser will throw an error saying that either video or audio has to be enabled.
        if (super.config.sendVideo || super.config.sendAudio) {
            try {
                super.localStream = await navigator.mediaDevices.getUserMedia(super.constraints);
                super.localStream.getTracks().forEach(track => super.peerConnection.addTrack(track,
                    super.localStream));

                super.config.localView.srcObject = super.localStream;
            } catch (err) {
                LOG.error('[VIEWER] Could not find webcam', err);
                return;
            }
        }
        // Create an SDP offer to send to the master
        LOG.log('[VIEWER] Creating SDP offer');
        await super.peerConnection.setLocalDescription(
            await super.peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true,
            }),
        );

        // When trickle ICE is enabled, send the offer now and then send ICE candidates as they are generated. Otherwise wait on the ICE candidates.
        if (super.config.useTrickleICE) {
            LOG.log('[VIEWER] Sending SDP offer');
            super.signalingClient.sendSdpOffer(super.peerConnection.localDescription);
        }
        LOG.log('[VIEWER] Generating ICE candidates');
    }

    async onSdpAnswer(answer) {
        // Add the SDP answer to the peer connection
        LOG.log('[VIEWER] Received SDP answer');
        await super.peerConnection.setRemoteDescription(answer);
    }

    onIceCandidate(candidate) {
        // Add the ICE candidate received from the MASTER to the peer connection
        LOG.log('[VIEWER] Received ICE candidate');
        super.peerConnection.addIceCandidate(candidate).then(()=>LOG.debug('ICE candidate added'))
            .catch(error => LOG.error(error));
    }

    onClose() {
        LOG.log('[VIEWER] Disconnected from signaling channel');
    }

    onError(error) {
        LOG.error('[VIEWER] Signaling client error: ', error);
    }

    async start() {
        super.start().then(() => {
            super.peerConnectionStatsInterval = setInterval(() => super.peerConnection.getStats()
                .then(super.onStatisticReport()), 1000);

            super.signalingClient.on('open', this.onOpen);
            super.signalingClient.on('sdpAnswer', this.onSdpAnswer);
            super.signalingClient.on('iceCandidate', this.onIceCandidate);
            super.signalingClient.on('close', this.onClose);
            super.signalingClient.on('error', this.onError);
            // Send any ICE candidates to the other peer
            super.peerConnection.addEventListener('icecandidate', ({ candidate }) => {
                if (candidate) {
                    LOG.log('[VIEWER] Generated ICE candidate');

                    // When trickle ICE is enabled, send the ICE candidates as they are generated.
                    if (super.config.useTrickleICE) {
                        LOG.log('[VIEWER] Sending ICE candidate');
                        super.signalingClient.sendIceCandidate(candidate);
                    }
                } else {
                    LOG.log('[VIEWER] All ICE candidates have been generated');

                    // When trickle ICE is disabled, send the offer now that all the ICE candidates have ben generated.
                    if (!super.config.useTrickleICE) {
                        LOG.log('[VIEWER] Sending SDP offer');
                        super.signalingClient.sendSdpOffer(super.peerConnection.localDescription);
                    }
                }
            });
            // As remote tracks are received, add them to the remote view
            super.peerConnection.addEventListener('track', event => {
                LOG.log('[VIEWER] Received remote track');
                if (super.config.remoteView.srcObject) {
                    return;
                }
                this.remoteStream = event.streams[0];
                super.config.remoteView.srcObject = this.remoteStream;
            });
            LOG.log('[VIEWER] Starting viewer connection');
            super.signalingClient.open();
        });
    }

    stop() {
        LOG.log('[VIEWER] Stopping viewer connection');
        if (super.signalingClient) {
            super.signalingClient.close();
            super.signalingClient = null;
        }

        if (super.peerConnection) {
            super.peerConnection.close();
            super.peerConnection = null;
        }

        if (super.localStream) {
            super.localStream.getTracks().forEach(track => track.stop());
            super.localStream = null;
        }

        if (this.remoteStream) {
            this.remoteStream.getTracks().forEach(track => track.stop());
            this.remoteStream = null;
        }

        if (super.peerConnectionStatsInterval) {
            clearInterval(super.peerConnectionStatsInterval);
            super.peerConnectionStatsInterval = null;
        }

        if (super.config.localView) {
            super.config.localView.srcObject = null;
        }

        if (super.config.remoteView) {
            super.config.remoteView.srcObject = null;
        }

        if (this.dataChannel) {
            this.dataChannel = null;
        }
    }

    sendMessage(message) {
        if (this.dataChannel) {
            try {
                this.dataChannel.send(message);
            } catch (e) {
                LOG.error('[VIEWER] Send DataChannel: ', e.toString());
            }
        }
    }

    getRole() {
        return ChannelRole.VIEWER;
    }
}