import React, {Fragment} from "react";
import {Config} from "./webrtc/caller";
import LOG from './Logger';
import { Grid, Button, Container } from '@mui/material';
import {createConsole} from "./inlineConsole";
import LogoutIcon from '@mui/icons-material/Logout';
import {PlayArrow} from "@mui/icons-material";
import {Chat} from './Chat';

export default class Workspace extends React.Component {
    _controller;
    _localView;
    _remoteView;

    constructor(props) {
        super(props);

        this.console = createConsole();
        this.showHideConsole = this.showHideConsole.bind(this);
        this.componentDidMount = this.componentDidMount.bind(this);
        this.componentWillUnmount = this.componentWillUnmount.bind(this);
        this.startStopHandle = this.startStopHandle.bind(this);
        this.onRemoteDataMessage = this.onRemoteDataMessage.bind(this);
        try {
            this.state = {
                signOut: props.signOut,
                Config,
                workspaceStarted: false,
                inlineConsoleVisible: false,
                chatMessages: ''
            };
            this.state.Config.localView = React.createRef();
            this.state.Config.remoteView = React.createRef();
            LOG.log('Configuration: ', Object.entries(Config));
            this._localView = <video id='localViewVideo' ref={this.state.Config.localView} autoPlay controls playsInline muted width="90%"/>;
            this._remoteView = <video id='remoteViewVideo' ref={this.state.Config.remoteView} autoPlay controls playsInline width="90%"/>
            this.initController();
            this.state._chatRef = React.createRef();
            this.Chat = <Chat ref={this.state._chatRef} sender={this._controller.sendMessage} senderName={this._controller.config.clientId}/>;
            this._controller.onRemoteDataMessage = this.onRemoteDataMessage;
        } catch(error) {
            LOG.error('Workspace is not created.', error);

            throw error;
        }
    }

    onRemoteDataMessage(channel, event) {
        LOG.debug(`Message received: ${channel.data}`);
        // this.setState((prev, props) => {
        //     return {
        //         ...prev,
        //         chatMessages: `${prev.chatMessages}\n${channel.data}`
        //     }
        // });
        this.state._chatRef.current.receiveMessage(channel.data);

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
        const inlinedConsole = createConsole();
        document.body.appendChild(inlinedConsole);
        LOG.debug('Created inline console: ' + inlinedConsole);
        const localStreamViewHeader = document.querySelector('#localStreamViewHeader');
        localStreamViewHeader.addEventListener('dblclick', event => this.showHideConsole());
    }

    showHideConsole() {
        this.setState((prevState, props) => {
            let inlinedConsole = document.getElementById('consoleWrapper');

            if (prevState.inlineConsoleVisible) {
                inlinedConsole.setAttribute('hidden', 'true');
            } else {
                inlinedConsole.removeAttribute('hidden');
            }
            return {...prevState, inlineConsoleVisible: !prevState.inlineConsoleVisible};
        });
    }

    componentWillUnmount() {
        this._controller.stop();
        this.setState({workspaceStarted: false});
    }

    startStopHandle() {
        this.setState((prevState, props) => {
            const newState = {...prevState, workspaceStarted: !prevState.workspaceStarted};
            this.props.started(newState.workspaceStarted);
            if (newState.workspaceStarted) {
                LOG.debug('Start');
                this._controller.start();
            } else {
                LOG.debug('Stop');
                this._controller.stop();
            }

            return newState;
        });
    }

    render() {
        const {currentUserCredentials} = this.props;
        if (!currentUserCredentials) {
            LOG.debug('No current user credentials.');
        } else {
            this._controller.setCredentials(currentUserCredentials);
        }
        const ClientId = this._controller.config.clientId ?
            <Grid item xs={12} lg={12}>Client id: {this._controller.config.clientId}</Grid> : null;

        return (
                <Grid container spacing={2}>
                    {ClientId}
                    <Grid item xs={6} lg={6}>
                        <h3 id='localStreamViewHeader'>Local Stream View</h3>
                        <Container fixed>
                            {this.localView}
                        </Container>
                    </Grid>
                    <Grid item xs={6} lg={6}>
                        <h3>Remote Stream View</h3>
                        <Container fixed>
                            {this.remoteView}
                        </Container>
                    </Grid>
                    <Grid item xs={6} lg={6}>
                        <Button variant="outlined" color='error' startIcon={<PlayArrow />}
                                onClick={this.startStopHandle}>{this.state.workspaceStarted ? 'Stop' : 'Start'}</Button>
                    </Grid>
                    <Grid item xs={6} lg={6}>
                        <Button onClick={this.state.signOut} variant='contained' startIcon={<LogoutIcon />}>Sign out</Button>
                    </Grid>
                    {this.Chat}
                </Grid>

        );
    }
}