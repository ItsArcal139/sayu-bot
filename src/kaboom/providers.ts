import { MessageAdditions } from "discord.js";
import { NewsChannel } from "discord.js";
import { Message } from "discord.js";
import { DMChannel } from "discord.js";
import { TextChannel } from "discord.js";
import { MessageOptions } from "discord.js";
import { Client, GuildMember } from "discord.js";
import * as util from "util";
import { SayuBot } from "../bot";
import { Logger } from "../utils/logger";

type UsableChannel = TextChannel | NewsChannel | DMChannel;
type DiscordMessage = ((MessageOptions & { split?: false | undefined; }) | MessageAdditions) & {
    embeds?: any[],
    components?: any[]
};
type MessageUsable = Message | {
    id: string
};

type DiscordMessageEdit = {
    embeds?: any[],
    components?: any[]
};

export abstract class ProviderBase {
    protected bot: SayuBot;
    
    constructor(bot: SayuBot) {
        this.bot = bot;
    }

    public abstract sendToChannel(channel: UsableChannel, data: DiscordMessage): Promise<MessageUsable>;
    public abstract editMessageAt(channel: UsableChannel, msg: string, data: DiscordMessageEdit): Promise<MessageUsable>;
    public abstract sendToMember(member: GuildMember, data: DiscordMessage): Promise<void>;
    public abstract kickMember(member: GuildMember, reason: string): Promise<void>;
    public abstract removeRole(member: GuildMember, roleId: string): Promise<void>;
    public abstract setChannelTopic(channel: Exclude<UsableChannel, DMChannel>, topic: string, reason?: string): Promise<void>;
}

export class OnDutyProvider extends ProviderBase {
    constructor(bot: SayuBot) {
        super(bot);
    }

    public async sendToChannel(channel: UsableChannel, data: DiscordMessage) {
        return await channel.send(data);
    }

    public async sendToMember(member: GuildMember, data: DiscordMessage) {
        await member.send(data);
    }
    
    public async kickMember(member: GuildMember, reason: string): Promise<void> {
        await member.kick(reason);
    }

    public async removeRole(member: GuildMember, roleId: string): Promise<void> {
        await member.roles.remove(roleId);
    }

    public async setChannelTopic(channel: Exclude<UsableChannel, DMChannel>, topic: string, reason?: string): Promise<void> {
        await channel.setTopic(topic, reason);
    }

    public async editMessageAt(channel: UsableChannel, msg: string, data: DiscordMessageEdit): Promise<MessageUsable> {
        return await channel.messages.edit(msg, data);
    }
}

export class TestProvider extends ProviderBase {
    constructor(bot: SayuBot) {
        super(bot);
    }

    public async sendToChannel(channel: UsableChannel, data: DiscordMessage) {
        const name = channel instanceof DMChannel ? channel.recipient.tag : channel.name;
        Logger.info(`-- Debug: Sends message with data to channel: ${name} (#${channel.id})`);
        Logger.info(util.inspect(data, false, 2, true));
        return { id: "<debug>" };
    }

    public async sendToMember(member: GuildMember, data: DiscordMessage): Promise<void> {
        Logger.info(`-- Debug: Sends message with data to member: ${member.user.tag} (#${member.id})`);
        Logger.info(util.inspect(data, false, 2, true));
    }

    public async kickMember(member: GuildMember, reason: string): Promise<void> {
        Logger.info(`-- Debug: Kicks member: ${member.user.tag} (reason: ${reason})`);
    }

    public async removeRole(member: GuildMember, roleId: string): Promise<void> {
        Logger.info(`-- Debug: Removes role #${roleId} from member: ${member.user.tag}`);
    }

    public async setChannelTopic(channel: Exclude<UsableChannel, DMChannel>, topic: string, reason?: string): Promise<void> {
        Logger.info(`-- Debug: Sets channel: ${channel.name} (#${channel.id}) topic: ${topic} (reason: ${reason})`);
    }

    public async editMessageAt(channel: UsableChannel, msg: string, data: DiscordMessageEdit): Promise<MessageUsable> {
        const name = channel instanceof DMChannel ? channel.recipient.tag : channel.name;
        Logger.info(`-- Debug: Edits message: #${msg} with data to channel: ${name} (#${channel.id})`);
        Logger.info(util.inspect(data, false, 2, true));
        return { id: "<debug>" };
    }
}