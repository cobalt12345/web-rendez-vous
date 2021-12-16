import React from "react";
import {Config} from "./webrtc/caller";
import LOG from './Logger';

export default class Workspace extends React.Component {
    _controller;
    _localView;
    _remoteView;

    constructor(props) {
        super(props);
        try {
            this._localView = <video autoPlay playsInline controls muted/>;
            this._remoteView = <video autoPlay playsInline controls/>;

            Config.localView = this._localView;
            Config.remoteView = this._remoteView;
            this.state = {
                Config
            };
            LOG.log('Configuration: ', Object.entries(Config));
            this.initController();
        } catch(error) {
            LOG.error('Workspace is not created.', error);

            throw error;
        }
    }

    initController() {
        this._controller = this.controller;
    }

    get controller() {
        throw new Error('Not implemented');
    }

    set controller(newController) {
        this._controller = newController;
    }

    get localView() {
        return this._localView;
    }

    get remoteView() {
        return this._remoteView;
    }

    componentDidCatch(error, errorInfo) {
        const msg = 'Workspace component failed';
        LOG.error(msg, error, errorInfo);
    }

    componentDidMount() {
        this._controller.start();
    }

    componentWillUnmount() {
        this._controller.stop();
    }

    render() {
        return (null);
    }
}