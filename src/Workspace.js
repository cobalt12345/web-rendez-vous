import React from "react";
import {Config} from "./webrtc/caller";
import LOG from './Logger';
import { Grid, Button, Container } from '@mui/material';
import {createConsole} from "./inlineConsole";
import LogoutIcon from '@mui/icons-material/Logout';

export default class Workspace extends React.Component {
    _controller;
    _localView;
    _remoteView;
    wsRefLocalView;
    wsRefRemoteView

    constructor(props) {
        super(props);

        this.console = createConsole();
        this.submitMessage = this.submitMessage.bind(this);
        this.showHideConsole = this.showHideConsole.bind(this);
        this.componentDidMount = this.componentDidMount.bind(this);
        this.componentWillUnmount = this.componentWillUnmount.bind(this);
        this.startStopHandle = this.startStopHandle.bind(this);
        try {
            this.state = {
                signOut: props.signOut,
                Config,
                workspaceStarted: false,
                inlineConsoleVisible: false
            };
            this.state.Config.localView = React.createRef();
            this.state.Config.remoteView = React.createRef();
            LOG.log('Configuration: ', Object.entries(Config));
            this._localView = <video id='localViewVideo' ref={this.state.Config.localView} autoPlay controls playsInline muted width="90%"/>;
            this._remoteView = <video id='remoteViewVideo' ref={this.state.Config.remoteView} autoPlay controls playsInline width="90%"/>
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

    submitMessage() {
        const textAreaMessages = document.getElementById('messages');
        LOG.debug('Text area messages:', textAreaMessages);
        try {
            const textContent = textAreaMessages.value;
            this._controller.sendMessage(textContent);
            LOG.debug('Submit messages');
        } catch(error) {
            LOG.error('Send message error:', error);
        }
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
                    <Button variant="outlined" color='error' startIcon={<LogoutIcon />}
                            onClick={this.startStopHandle}>{this.state.workspaceStarted ? 'Stop' : 'Start'}</Button>
                </Grid>
                <Grid item xs={6} lg={6}>
                    <Button onClick={this.state.signOut} variant='contained' startIcon={<LogoutIcon />}>Sign out</Button>
                </Grid>
                {/*<Grid item xs={8} lg={8}>*/}
                {/*    <h4>Chat:</h4>*/}
                {/*    <textarea id="messages" type="text" placeholder="DataChannel Message" rows={7} cols={30}></textarea>*/}
                {/*</Grid>*/}
                {/*<Grid item>*/}
                {/*    <button onClick={this.submitMessage}>Send</button>*/}
                {/*</Grid>*/}
            </Grid>
        );
    }
}