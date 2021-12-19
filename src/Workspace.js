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
            this._localView = <video id={this.getLocalViewId()} controls playsInline muted width="90%"/>;
            this._remoteView = <video id={this.getRemoteViewId()} controls playsInline width="90%"/>
            Config.localViewId = this.getLocalViewId();
            Config.remoteViewId = this.getRemoteViewId();
            this.state = {
                Config,
                workspaceStarted: false
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

    getLocalViewId() {
        throw new Error('Not implemented');
    }

    getRemoteViewId() {
        throw new Error('Not implemented');
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

    }

    componentWillUnmount() {
        this._controller.stop();
        this.setState({workspaceStarted: false});
    }

    render() {
        const {currentUserCredentials} = this.props;
        if (!currentUserCredentials) {
            LOG.debug('No current user credentials.');
        } else {
            if (!this.state.workspaceStarted) {
                LOG.debug('Try to start workspace. Current user credentials:', currentUserCredentials);
                const newState = {
                    workspaceStarted: true
                };
                this.setState(newState);
                this._controller.setCredentials(currentUserCredentials);
                this._controller.start();
            } else {
                LOG.debug('Workspace is already started.');
            }
        }

        return (null);
    }
}