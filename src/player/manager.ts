import { GuildMember, InviteGuild, MessageEmbedOptions, TextChannel } from "discord.js";
import { SayuGuildManager } from "../guildManager";
import ytdl from "ytdl-core";
import { EventEmitter } from "events";
import { PromiseTimer } from "../utils/timeprom";
import { Logger } from "../utils/logger";

export class PlayerManager extends EventEmitter {
    private guildManager: SayuGuildManager;
    public loopMode = LoopMode.none;
    public queue = new SongQueueList();
    private currentIndex = -1;

    private skipped = false;
    private jumpTarget = -1;
    private isPlaying = false;

    constructor(manager: SayuGuildManager) {
        super();
        this.guildManager = manager;
    }

    public get currentPlaying() {
        return this.currentIndex;
    }

    public get voiceController() {
        return this.guildManager.voiceController;
    }

    public dispose() {
        this.reset();
    }

    public getExtendedEmbed(embed: MessageEmbedOptions, removeAuthor = true): MessageEmbedOptions {
        if(removeAuthor) {
            return this.guildManager.bot.getExtendedEmbed({
                author: undefined,
                ...embed
            });
        } else {
            return this.guildManager.bot.getExtendedEmbed({
                ...embed
            });
        }
    }

    public getNextIndex() {
        if(this.jumpTarget != -1) {
            const t = this.jumpTarget;
            this.jumpTarget = -1;
            return t;
        }

        if(this.loopMode == LoopMode.track) {
            return this.currentIndex;
        }

        if(this.loopMode == LoopMode.queue && this.currentIndex + 1 == this.queue.count) {
            return 0;
        }

        return ++this.currentIndex == this.queue.count ? -1 : this.currentIndex;
    }

    public skip() {
        this.voiceController.forceStop();
    }

    private async playLast() {
        this.currentIndex = this.queue.count - 1;
        await this.play();
    }

    private async sendToLastTextChannel(embed: MessageEmbedOptions, removeAuthor = true, asLastPlaying = true) {
        const channel = this.guildManager.guild.channels.cache.get(this.guildManager.config.data.player.lastTextChannel);
        if(channel instanceof TextChannel) {
            // Sends playing embed.
            const r = await channel.send({
                embeds: [
                    this.getExtendedEmbed(embed, removeAuthor)
                ]
            });

            if(asLastPlaying) {
                this.guildManager.config.data.player.lastPlayingMessage = r.id;
                this.guildManager.config.save();
            }
        }
    }

    private async play() {
        if(this.isPlaying) {
            Logger.warn("play() called when playing");
            return;
        }

        const vc = this.voiceController;
        const queue = this.queue.items[this.currentIndex];
        if(!queue) {
            this.currentIndex = -1;
            this.idle();
            return;
        }

        this.isPlaying = true;
        this.emit("play");
        this.sendToLastTextChannel({
            title: "現正播放",
            description: `[${queue.meta.title}](${queue.meta.url}) [<@${queue.member.id}>]`
        });

        const query = queue.meta.url;
        await vc.waitForReady();
        vc.setVolume(this.guildManager.config.data.player.volume);
        vc.playByYTDL(query, () => {
            this.sendToLastTextChannel({
                description: `喔不..${this.guildManager.bot.config.nickname}不能放這首歌....`,
                fields: [
                    {
                        name: "歌曲",
                        value: `[${queue.meta.title}](${queue.meta.url}) [<@${queue.member.id}>]`
                    }
                ]
            }, false, false);
        });

        await vc.waitForEnded();
        this.removeLastPlayingMessage();
        this.isPlaying = false;
        this.playNextIfNotPlaying();
    }

    private playNextIfNotPlaying() {
        this.currentIndex = this.getNextIndex();
        this.play();
    }

    private async idle() {
        this.emit("idle");
        this.currentIndex = -1;
    }

    public async queueYouTube(query: string, member: GuildMember) {
        const info = await ytdl.getInfo(query);
        const title = info.videoDetails.title;

        const queue = new SongQueueItem(member, {
            title,
            url: query
        });
        this.emit("queue", queue);

        // We treat query as URL for now
        this.queue.queue(queue);

        if(this.currentIndex == -1) {
            this.playLast();
        }

        return queue;
    }

    public async queueSpeak(query: string, member: GuildMember) {
        const queue = new SongQueueItem(member, {
            title: "Speak: " + query,
            url: this.guildManager.rootPath + "voice.mp3",
            isFile: true
        });
        this.emit("queue", queue);

        // We treat query as URL for now
        this.queue.queue(queue);

        if(this.currentIndex == -1) {
            this.playLast();
        }

        return queue;
    }

    public removeLastPlayingMessage() {
        const channel = this.guildManager.guild.channels.cache.get(this.guildManager.config.data.player.lastTextChannel);
        if(channel instanceof TextChannel) {
            const msg = this.guildManager.config.data.player.lastPlayingMessage;
            if(msg) channel.messages.delete(msg).catch(() => {});
        }
    }

    public removeQueue(index: number) {
        this.queue.remove(index);

        if(index == this.currentIndex) {
            this.skip();
        }

        if(index <= this.currentIndex) {
            this.currentIndex--;
        }
    }

    public jumpTo(index: number) {
        this.jumpTarget = index;
        this.skip();
    }

    public clearQueue() {
        this.queue = new SongQueueList();
        this.currentIndex = -1;
        this.loopMode = LoopMode.none;
        this.voiceController.forceStop();
        this.removeLastPlayingMessage();
    }

    public reset() {
        this.clearQueue();
        this.voiceController.leaveChannel();
    }

    public pause() {
        this.voiceController.pause();
    }

    public resume() {
        this.voiceController.resume();
    }
}

export enum LoopMode {
    none, queue, track
}

export interface SongMeta {
    title: string,
    url: string,
    isFile?: boolean
}

export class SongQueueItem {
    public member: GuildMember;
    public meta: SongMeta;

    constructor(member: GuildMember, meta: SongMeta) {
        this.member = member;
        this.meta = meta;
    }
}

export class SongQueueList {
    public items: SongQueueItem[] = [];
    
    public queue(item: SongQueueItem) {
        this.items.push(item);
    }

    public remove(index: number) {
        this.items.splice(index, 1);
    }

    public get count() {
        return this.items.length;
    }

    public peek(): SongQueueItem | undefined {
        return this.items[0];
    }

    public dequeue(): SongQueueItem | undefined {
        return this.items.shift();
    }
}