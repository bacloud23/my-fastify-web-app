import { getChannels, newSocket, recoverState } from './refresh.js'

recoverState()
if (newSocket()) getChannels()