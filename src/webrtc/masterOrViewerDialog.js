import React from "react";
import { v4 as uuidv4 } from 'uuid';
import LOG from '../Logger';
import Dialog from '@mui/material/Dialog';
import {Button, DialogContent, DialogContentText, DialogTitle} from "@mui/material";

type DialogState = {
    isMasterRoom: boolean,
    roomId: string,
    isOpened: true
}

export default class MasterOrViewerDialog extends React.Component {

    static MAX_NUM_OF_ROOMS: Number = 20;
    static roomsOpened = 0;
    static openedRooms = new Map();

    state: DialogState = {
        isMasterRoom: false,
        roomId: null,
        isOpened: true
    }

    openMasterRoom(): Number {
        let newRoomNum = MasterOrViewerDialog.roomsOpened + 1;
        if (newRoomNum > MasterOrViewerDialog.MAX_NUM_OF_ROOMS) {
            throw Error('No more rooms! ' + newRoomNum);
        } else {
            ++MasterOrViewerDialog.openedRooms;
            let roomId: string = uuidv4();
            this.setState({isMasterRoom: true, roomId});
            MasterOrViewerDialog.openedRooms.set(roomId, this)
            LOG.debug("Created room: " + roomId);

            return roomId;
        }
    }

    openViewerRoom(roomId: String): void {
        if (!MasterOrViewerDialog.openedRooms.has(roomId)) {
            throw Error(`Room ${roomId} doesn\'t exist!`);
        } else {
            LOG.debug("Opened room: " + roomId);
        }
    }

    closeRoom() {
        const currentRoomId = this.state.roomId;
        MasterOrViewerDialog.openedRooms.delete(currentRoomId);
        LOG.debug(`Closed room: ${currentRoomId}`);
        this.setState({isMasterRoom: false, roomId: null})

        return currentRoomId;
    }

    render() {
        return (
            <div>
                <Dialog open={this.state.isOpened} fullScreen>
                    <DialogTitle>Welcome</DialogTitle>
                    <DialogContent>
                        <DialogContentText>
                            Create a new room or enter to the existing one.
                        </DialogContentText>
                        <Button onClick={() => this.setState({isOpened: false})}>Open</Button>
                    </DialogContent>
                </Dialog>
            </div>
        );
    }
}