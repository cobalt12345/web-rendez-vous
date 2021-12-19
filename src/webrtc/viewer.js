import {Caller} from "./caller";
import {ChannelRole} from "@aws-sdk/client-kinesis-video";
import LOG from '../Logger';

export default class Viewer extends Caller {

    remoteStream;
    dataChannel;

    constructor(config) {
        super(config);

        this.onOpen = this.onOpen.bind(this);
        this.onSdpAnswer = this.onSdpAnswer.bind(this);
        this.onIceCandidate = this.onIceCandidate.bind(this);
        this.onClose = this.onClose.bind(this);
        this.onError = this.onError.bind(this);
    }
    async onOpen() {
        LOG.log('[VIEWER] Connected to signaling service');

        // Get a stream from the webcam, add it to the peer connection, and display it in the local view.
        // If no video/audio needed, no need to request for the sources.
        // Otherwise, the browser will throw an error saying that either video or audio has to be enabled.
        if (this.config.sendVideo || this.config.sendAudio) {
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia(this.constraints);
                this.localStream.getTracks().forEach(track => this.peerConnection.addTrack(track,
                    this.localStream));

                const localView = document.getElementById(this.config.localViewId);
                localView.srcObject = this.localStream;
            } catch (err) {
                LOG.error('[VIEWER] Could not find webcam', err);
                return;
            }
        }
        // Create an SDP offer to send to the master
        LOG.log('[VIEWER] Creating SDP offer');
        await this.peerConnection.setLocalDescription(
            await this.peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true,
            }),
        );

        // When trickle ICE is enabled, send the offer now and then send ICE candidates as they are generated. Otherwise wait on the ICE candidates.
        if (this.config.useTrickleICE) {
            LOG.log('[VIEWER] Sending SDP offer');
            this.signalingClient.sendSdpOffer(this.peerConnection.localDescription);
        }
        LOG.log('[VIEWER] Generating ICE candidates');
    }

    async onSdpAnswer(answer) {
        // Add the SDP answer to the peer connection
        LOG.log('[VIEWER] Received SDP answer');
        await this.peerConnection.setRemoteDescription(answer);
    }

    onIceCandidate(candidate) {
        // Add the ICE candidate received from the MASTER to the peer connection
        LOG.log('[VIEWER] Received ICE candidate');
        this.peerConnection.addIceCandidate(candidate).then(()=>LOG.debug('ICE candidate added'))
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
            this.peerConnection = new RTCPeerConnection(this.configuration);
            LOG.debug(`[VIEWER] RTC peer connection:`, this.peerConnection);
            if (this.config.openDataChannel) {
                this.dataChannel = this.peerConnection.createDataChannel('kvsDataChannel');
                this.peerConnection.ondatachannel = event => {
                    event.channel.onmessage = this.onRemoteDataMessage;
                };
            }
            this.peerConnectionStatsInterval = setInterval(() => this.peerConnection.getStats()
                .then(this.onStatisticReport()), 1000);

            this.signalingClient.on('open', this.onOpen);
            this.signalingClient.on('sdpAnswer', this.onSdpAnswer);
            this.signalingClient.on('iceCandidate', this.onIceCandidate);
            this.signalingClient.on('close', this.onClose);
            this.signalingClient.on('error', this.onError);
            // Send any ICE candidates to the other peer
            this.peerConnection.addEventListener('icecandidate', ({ candidate }) => {
                if (candidate) {
                    LOG.log('[VIEWER] Generated ICE candidate');

                    // When trickle ICE is enabled, send the ICE candidates as they are generated.
                    if (this.config.useTrickleICE) {
                        LOG.log('[VIEWER] Sending ICE candidate');
                        this.signalingClient.sendIceCandidate(candidate);
                    }
                } else {
                    LOG.log('[VIEWER] All ICE candidates have been generated');

                    // When trickle ICE is disabled, send the offer now that all the ICE candidates have ben generated.
                    if (!this.config.useTrickleICE) {
                        LOG.log('[VIEWER] Sending SDP offer');
                        this.signalingClient.sendSdpOffer(this.peerConnection.localDescription);
                    }
                }
            });
            // As remote tracks are received, add them to the remote view
            this.peerConnection.addEventListener('track', event => {
                LOG.log('[VIEWER] Received remote track');
                const remoteView = document.getElementById(this.config.remoteViewId);
                if (remoteView.srcObject) {
                    return;
                }
                this.remoteStream = event.streams[0];
                remoteView.srcObject = this.remoteStream;
            });
            LOG.log('[VIEWER] Starting viewer connection');
            this.signalingClient.open();
        });
    }

    stop() {
        LOG.log('[VIEWER] Stopping viewer connection');
        if (this.signalingClient) {
            this.signalingClient.close();
            this.signalingClient = null;
        }

        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        if (this.remoteStream) {
            this.remoteStream.getTracks().forEach(track => track.stop());
            this.remoteStream = null;
        }

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