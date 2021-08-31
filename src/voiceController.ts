import { StageChannel, VoiceChannel } from "discord.js";
import { AudioPlayer, AudioPlayerStatus, AudioResource, createAudioPlayer, createAudioResource, entersState, getVoiceConnection, joinVoiceChannel, VoiceConnection, VoiceConnectionStatus } from "@discordjs/voice";
import { PromiseTimer } from "./utils/timeprom";
import { Logger } from "./utils/logger";
import ytdl from "ytdl-core";

export class VoiceError extends Error {
    constructor(message: string) {
        super(message);
    }
}

export class VoiceController {
    private connection: VoiceConnection | null | undefined = null;
    private player: AudioPlayer | null = null;
    private resource: AudioResource | null = null;
    private volume = 1;

    public joinChannel(channel: VoiceChannel | StageChannel) {
        joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator
        });

        this.connection = getVoiceConnection(channel.guild.id);
        if(this.connection == null) {
            throw new VoiceError("The connection is not established.");
        }
    }

    public async waitForReady(timeout: number = 5000) {
        await entersState(this.connection!!, VoiceConnectionStatus.Ready, timeout);
    }

    public playByPath(path: string) {
        this.player = createAudioPlayer();
        const subscription = this.connection?.subscribe(this.player);
        if(!subscription) {
            throw new VoiceError("subscription == null");
        }

        this.resource = createAudioResource(path, { inlineVolume: true });
        this.resource.volume?.setVolume(this.volume);
        this.player.play(this.resource);
    }

    public playByYTDL(url: string, onerror = () => {}) {
        this.player = createAudioPlayer();
        const subscription = this.connection?.subscribe(this.player);
        if(!subscription) {
            throw new VoiceError("subscription == null");
        }

        this.resource = createAudioResource(ytdl(url, {
            highWaterMark: 1 << 25,
            filter: "audioonly"
        }), { inlineVolume: true });
        
        this.player.on("error", err => {
            Logger.error("Audio player (YTDL) occurred an error!");
            Logger.error(err.toString());
            onerror();
        });

        this.resource.volume?.setVolume(this.volume);
        this.player.play(this.resource);
    }

    public setVolume(decimal: number) {
        this.volume = decimal;
        this.resource?.volume?.setVolume(decimal);
    }

    public async waitForEnded() {
        while(this.resource && !this.resource?.ended) {
            await PromiseTimer.timeout(16);
        }
    }

    public leaveChannel() {
        this.connection?.destroy();
    }

    public isPlaying() {
        return this.player?.state.status == AudioPlayerStatus.Playing;
    }

    public forceStop() {
        this.player?.stop();
        this.resource = null;
    }

    public pause() {
        this.player?.pause();
    }

    public resume() {
        this.player?.unpause();
    }
}