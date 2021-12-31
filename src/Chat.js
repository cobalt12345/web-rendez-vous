import React from "react";
import {Grid, Button, Container, TextField, Stack} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';

class Chat extends React.Component {

    constructor(props) {
        super(props);
        if (!('sender' in props)) {
            throw new Error('Sender must be provided.');
        } else {
            this.messageSender = props['sender'];
        }
        this.state = {message: '', chat: '', senderName: props.senderName};
        this.handleMessageTypeIn = this.handleMessageTypeIn.bind(this);
        this.sendMessage = this.sendMessage.bind(this);
        this.receiveMessage = this.receiveMessage.bind(this);
    }

    handleMessageTypeIn(event) {
        this.setState({message: event.target.value})
    }

    sendMessage() {
        const message = this.state.message;
        this.messageSender((this.state.senderName || 'Master') + ': ' + message);
        this.setState((prevState) => {
            return {
                ...prevState,
                chat: `${prevState.chat}
                You: ${message}`
            }
        });
        this.setState({message: ''});
    }

    receiveMessage(message) {
        this.setState((prevState, props) => {
            return {
                ...prevState,
                chat: `${prevState.chat}
                ${message}`
            }
        });
    }

    render() {

        return (
            <Grid item xs={12} lg={12}>
            <Grid container spacing={2}>
                <Grid item xs={6} lg={6}>
                    <Container fixed>
                        <Stack spacing={2} >
                            <TextField id='new-message-text' fullWidth label='Message:' onChange={this.handleMessageTypeIn}
                                       value={this.state.message} multiline rows={4} variant='filled'
                                />
                            <Button variant='contained' startIcon={<SendIcon/>} onClick={this.sendMessage}>Send</Button>
                        </Stack>
                    </Container>
                </Grid>
                <Grid item xs={6} lg={6}>
                    <Container fixed>
                        <TextField id='all-messages' label='Chat'
                               disabled
                               fullWidth
                               variant='outlined'
                               color='secondary'
                               multiline
                               rows = {6}
                               value={this.state.chat} />
                    </Container>
                </Grid>
            </Grid>
            </Grid>
        );
    }
}

export {
    Chat
};