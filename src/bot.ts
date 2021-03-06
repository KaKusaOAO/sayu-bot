import {
    ApplicationCommandData, ButtonInteraction, ChatInputApplicationCommandData,
    CommandInteraction, ContextMenuInteraction, DMChannel, Guild, GuildMember, 
    Message, MessageComponentInteraction, MessageEmbedOptions,
    SelectMenuInteraction, Client
} from 'discord.js';
import { BotConfig } from './config';
import { Logger } from './utils/logger';
import { EventEmitter } from 'stream';
import { SayuGuildManager } from './guildManager';
import { LoopMode } from './player/manager';
import * as util from "util";

export class SayuBot extends EventEmitter {
    public api: Client;
    public config: BotConfig;

    private activityInterval: NodeJS.Timer | null = null;
    private canAcceptConsoleInput = true;

    public static instance: SayuBot;
    public guildManagers = [] as SayuGuildManager[];

    constructor() {
        super();

        SayuBot.instance = this;
        this.config = new BotConfig();
        this.api = new Client({
            intents: [ "GUILDS", "GUILD_VOICE_STATES", "GUILD_MEMBERS", "GUILD_MESSAGES" ],
            partials: ["MESSAGE", "CHANNEL"]
        });

        this.api.on('ready', async () => {
            const user = this.api.user;
            Logger.info(`Discord bot logged in as ${user?.username}#${user?.discriminator}`);

            const activityTimer = (async () => {
                await this.api.user?.setActivity({
                    ...this.config.data.activity
                });
                await this.api.user?.setStatus(this.config.data.status);
            });
            activityTimer();
            this.activityInterval = setInterval(activityTimer, 1000 * 60 * 2);
            this.emit("ready");

            await Promise.all(this.api.guilds.cache.map(async (g) => {
                this.guildManagers.push(new SayuGuildManager(this, g));
            }));
            await this.registerSlashCommands();
        });

        this.api.on("error", err => {
            Logger.error(err.stack ?? err.toString());
        });

        this.api.on("messageCreate", (msg: Message) => {
            if(msg.channel instanceof DMChannel && msg.author.id != this.api.user?.id) {
                Logger.info(msg.author.tag + ": " + msg.content);
            }
        })

        this.api.on("guildCreate", g => {
            Logger.info(`GuildCreate: from guild ${g.name} (#${g.id})`);

            this.guildManagers.push(new SayuGuildManager(this, g));
            this.registerGuildSlashCommands(g);
        });

        this.api.on("guildDelete", g => {
            Logger.info(`GuildDelete: from guild ${g.name} (#${g.id})`);

            let i = this.guildManagers.findIndex(m => {
                return m.guild.id == g.id;
            });

            if(i >= 0) {
                let m = this.guildManagers[i];
                m.dispose();
                this.guildManagers.splice(i, 1);
            }
        });

        this.api.on("voiceStateUpdate", (o, n) => {
            if(n.channel == null && n.member!!.id == this.api.user!!.id) {
                const g = o.channel!!.guild;
                const m = this.getGuildManager(g);
                try {
                    m?.player.reset();
                } catch(_) {}
            }
        });

        this.api.on("interactionCreate", async (interaction) => {
            if(interaction.isCommand()) {
                try {
                    await this.handleCommandInteraction(interaction);
                } catch(ex: any) {
                    interaction.reply({
                        embeds: [
                            this.getExtendedEmbed({
                                description: "??????????????????...OHQ",
                                fields: [
                                    { name: "????????????", value: "`" + ex.toString() + "`" }
                                ]
                            }, interaction.guild)
                        ]
                    });
                }
                return;
            }

            if(interaction.isButton()) {
                await this.handleButtonInteraction(interaction);
                return;
            }

            if(interaction.isMessageComponent()) {
                await this.handleMessageComponentInteraction(interaction);
                return;
            }

            if(interaction.isContextMenu()) {
                await this.handleContextMenuInteraction(interaction);
                return;
            }
        });
    }

    public async login() {
        const token = this.config.getToken();
        if(!token || token == '') {
            throw new Error('Discord bot token is not set!');
        }

        await this.api.login(token);
    }

    public async registerSlashCommands() {
        await Promise.all(this.api.guilds.cache.map(async (g) => {
            await this.registerGuildSlashCommands(g);
        }));
    }

    public async registerGuildSlashCommands(guild: Guild) {
        Logger.log(`Registering command for guild: ${guild.name} (${guild.id})`);

        const nickName = this.config.nickname;
        const commands: ChatInputApplicationCommandData[] = [
            {
                name: this.config.commandName,
                description: `???${nickName}????????????...zzZ`,
                options: [
                    {
                        name: "help",
                        description: `${nickName}??????????????????????????????`,
                        type: "SUB_COMMAND"
                    },
                    {
                        name: "play",
                        description: `${nickName}????????? DJ???`,
                        type: "SUB_COMMAND",
                        options: [
                            {
                                name: "query",
                                description: `${nickName}????????????????????????`,
                                type: "STRING",
                                required: true
                            }
                        ]
                    },
                    {
                        name: "skip",
                        description: `${nickName}????????????????????????????????????`,
                        type: "SUB_COMMAND"
                    },
                    {
                        name: "loop",
                        description: `${nickName}??????????????????????????????`,
                        type: "SUB_COMMAND",
                        options: [
                            {
                                name: "mode",
                                description: `${nickName}???????????????????????????DD`,
                                type: "STRING",
                                choices: [ "queue", "track", "none" ].map(s => { return { name: s, value: s }; }),
                                required: true
                            }
                        ]
                    },
                    {
                        name: "leave",
                        description: `${nickName}????????????????????????????????????`,
                        type: "SUB_COMMAND"
                    },
                    {
                        name: "pause",
                        description: `${nickName}???????????????????????????????????????????????????`,
                        type: "SUB_COMMAND"
                    },
                    {
                        name: "resume",
                        description: `${nickName}?????????????????????`,
                        type: "SUB_COMMAND"
                    },
                    {
                        name: "list",
                        description: `${nickName}????????????????????????????????????`,
                        type: "SUB_COMMAND"
                    },
                    {
                        name: "join",
                        description: `${nickName}?????????????????????`,
                        type: "SUB_COMMAND"
                    },
                    {
                        name: "stop",
                        description: `${nickName}???????????????`,
                        type: "SUB_COMMAND"
                    },
                    {
                        name: "remove",
                        description: `${nickName}????????????????????????`,
                        type: "SUB_COMMAND",
                        options: [
                            {
                                name: "index",
                                description: "???...???????????????...",
                                type: "INTEGER",
                                required: true
                            }
                        ]
                    },
                    {
                        name: "clear",
                        description: `${nickName}??????????????????????????????`,
                        type: "SUB_COMMAND"
                    },
                    {
                        name: "jump",
                        description: `${nickName}????????????????????????????????????`,
                        type: "SUB_COMMAND",
                        options: [
                            {
                                name: "index",
                                description: "???...????????????????????????...",
                                type: "INTEGER",
                                required: true
                            }
                        ]
                    },
                    {
                        name: "source",
                        description: `???...??????${nickName}?????????...`,
                        type: "SUB_COMMAND"
                    }
                ]
            }
        ];

        const config = this.getGuildManager(guild)?.config;
        if(config?.data.kaboom.enabled) {
            commands[0].options?.unshift({
                name: "kaboom",
                description: `${nickName}???????????????????????????????????????`,
                type: "SUB_COMMAND_GROUP",
                options: [
                    {
                        name: "set",
                        description: `${nickName}????????????????????????????????????????????????`,
                        type: "SUB_COMMAND",
                        options: [
                            {
                                name: "month",
                                description: `${nickName}?????????????????????????????????????????????`,
                                type: "INTEGER",
                                required: true
                            },
                            {
                                name: "date",
                                description: `${nickName}?????????????????????????????????????????????`,
                                type: "INTEGER",
                                required: true
                            },
                            {
                                name: "hour",
                                description: `${nickName}?????????????????????????????????????????????`,
                                type: "INTEGER",
                                required: false
                            },
                            {
                                name: "minute",
                                description: `${nickName}?????????????????????????????????????????????`,
                                type: "INTEGER",
                                required: false
                            }
                        ]
                    },
                    {
                        name: "cancel",
                        description: `${nickName}?????????????????????????????????zzZ`,
                        type: "SUB_COMMAND"
                    },
                    {
                        name: "update",
                        description: `${nickName}??????????????????????????????...zzZ`,
                        type: "SUB_COMMAND"
                    }
                ]
            });
        }

        await Promise.all(commands.map(async(cmd: ApplicationCommandData) => {
            const old = guild.commands.cache.first();
            if(old) {
                await guild.commands.delete(old);
            }
            await guild.commands.create(cmd);
        }));
    }

    public async acceptConsoleInput(input: string) {
        if(!this.canAcceptConsoleInput) return;

        if(input.trim().split(" ")[0] == "reload") {
            Logger.info("Reloading...");
            this.reload();
        }

        if(input.trim().split(" ")[0] == "dump" && input.length >= 6) {
            let objs = input.trim().split(" ");
            if(objs.length < 3) return;

            try {
                const depth = parseInt(objs[1]);
                if(isNaN(depth)) throw new Error();

                objs.shift();
                objs.shift();

                let obj = objs.join(" ");
                if(objs.length == 0) return;

                if(!obj.startsWith("$")) return;
                if(obj.length > 1 && obj[1] != ".") return;
                obj = obj.substring(1);
    
                try {
                    const target = eval("SayuBot.instance" + obj);
                    Logger.info(util.inspect(target, false, depth, true));
                } catch(ex: any) {
                    Logger.error("Failed to dump");
                    Logger.error(ex.toString());
                }
            } catch(ex) {
                Logger.error(`depth "${objs[0]}" is not a number`);
            }
            return;
        }

        if(input.trim().split(" ")[0] == "exit") {
            await this.exit();
        }
    }
    
    public async handleCommandInteraction(interaction: CommandInteraction) {
        const options = interaction.options;
        if(interaction.commandName == this.config.commandName) {
            let sub = options.getSubcommandGroup(false);
            if(sub == "kaboom") {
                await this.executeKaboom(interaction);
                return;
            }

            sub = options.getSubcommand();

            if(sub == "help") {
                await this.executeHelp(interaction);
                return;
            }

            if(sub == "play") {
                await this.executePlay(interaction);
                return;
            }

            if(sub == "skip") {
                await this.executeSkip(interaction);
                return;
            }

            if(sub == "leave") {
                await this.executeLeave(interaction);
                return;
            }

            if(sub == "pause") {
                await this.executePause(interaction);
                return;
            }

            if(sub == "resume") {
                await this.executeResume(interaction);
                return;
            }

            if(sub == "loop") {
                await this.executeLoop(interaction);
                return;
            }

            if(sub == "list") {
                await this.executeList(interaction);
                return;
            }

            if(sub == "jump") {
                await this.executeJump(interaction);
                return;
            }

            if(sub == "clear") {
                await this.executeClear(interaction);
                return;
            }

            if(sub == "remove") {
                await this.executeRemove(interaction);
                return;
            }

            if(sub == "join") {
                await this.executeJoin(interaction);
                return;
            }

            if(sub == "stop") {
                await this.executeStop(interaction);
                return;
            }

            if(sub == "source") {
                await this.executeSource(interaction);
                return;
            }
        }
    }

    public getGuildManager(guild: Guild): SayuGuildManager | undefined
    public getGuildManager(guild: null): undefined
    public getGuildManager(guild: Guild | null): SayuGuildManager | undefined {
        if(!guild) return undefined;
        return this.guildManagers.find(m => m.guild.id == guild.id);
    }

    public async replyWithInsufficientPermission(interaction: MessageComponentInteraction | CommandInteraction) {
        interaction.reply({
            ephemeral: true,
            embeds: [
                this.getExtendedEmbed({
                    description: `${this.config.nickname}??????????????????????????????...zzZ`
                }, interaction.guild)
            ]
        });
    }

    public async executeSource(interaction: CommandInteraction) {
        interaction.reply({
            embeds: [
                this.getExtendedEmbed({
                    description: `?????????${this.config.nickname}???[??????](${this.config.repository.url})???...<3`
                }, interaction.guild)
            ]
        });
    }

    public async executeHelp(interaction: CommandInteraction) {
        interaction.reply({
            embeds: [
                this.getExtendedEmbed({
                    description: `${this.config.nickname}???????????????????????????[?????????????????????](https://github.com/ItsArcal139/sayu-bot/blob/master/docs/help.md)`
                }, interaction.guild)
            ]
        });
    }

    public async executeKaboom(interaction: CommandInteraction) {
        const options = interaction.options;

        const member = interaction.member as GuildMember;
        if(!member.permissions.has("MANAGE_GUILD")) {
            this.replyWithInsufficientPermission(interaction);
            return;
        }

        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        const sub = options.getSubcommand(true);
        if(sub == "cancel") {
            guildManager.kaboom.cancel();
            guildManager.config.data.kaboom.activeSchedule = null;
            guildManager.config.save();
            interaction.reply({
                ephemeral: true,
                embeds: [
                    this.getExtendedEmbed({
                        description: "??????????????????????????????...zzZ"
                    }, interaction.guild)
                ]
            });
            return;
        }

        if(sub == "update") {
            guildManager.kaboom.update();
            interaction.reply({
                ephemeral: true,
                embeds: [
                    this.getExtendedEmbed({
                        description: "??????????????????????????????????????????...zzZ"
                    }, interaction.guild)
                ]
            });
            return;
        }

        const month = options.getInteger("month", true);
        const date = options.getInteger("date", true);
        const hour = options.getInteger("hour", false) ?? 0;
        const minute = options.getInteger("minute", false) ?? 0;

        guildManager.kaboom.schedule(month, date, hour, minute);
        interaction.reply({
            ephemeral: true,
            embeds: [
                this.getExtendedEmbed({
                    description: "??????????????????????????????...zzZ"
                }, interaction.guild)
            ]
        });
    }

    private async playerCommandCheckPermission(interaction: CommandInteraction, botChannelRequired: boolean = true) {
        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        const member = interaction.member!! as GuildMember;
        const channel = member.voice.channel;
        if(!channel) {
            await interaction.reply({
                embeds: [
                    this.getExtendedEmbed({
                        description: `${this.config.nickname}?????????????????????????????????????????????????????????`
                    }, interaction.guild)
                ]
            });
            return false;
        }

        const botMember = guildManager.guild.members.cache.get(this.api.user!!.id)!!;
        if(botChannelRequired && !botMember.voice.channel) {
            interaction.reply({
                embeds: [
                    this.getExtendedEmbed({
                        description: `${this.config.nickname}???????????????????????????????????????`
                    }, interaction.guild)
                ]
            });
            return false;
        }

        if(botMember.voice.channel && botMember.voice.channel.id != channel.id) {
            interaction.editReply({
                embeds: [
                    this.getExtendedEmbed({
                        description: `????????????${this.config.nickname}??????????????????????????????????????????`
                    }, interaction.guild)
                ]
            });
            return false;
        }

        return true;
    }

    public async executePlay(interaction: CommandInteraction) {
        if(!this.playerCommandCheckPermission(interaction, false)) return;

        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        const voiceController = guildManager.voiceController;

        const options = interaction.options;
        const query = options.getString("query", true);

        const member = interaction.member!! as GuildMember;
        const channel = member.voice.channel!!;
        guildManager.config.data.player.lastTextChannel = interaction.channelId;
        voiceController.joinChannel(channel);

        const queue = await guildManager.player.queueYouTube(query, member);
        interaction.reply({
            embeds: [
                this.getExtendedEmbed({
                    description: `Queued [${queue.meta.title}](${queue.meta.url}) [<@${queue.member.id}>]`
                }, interaction.guild)
            ]
        });
    }

    public async executeSkip(interaction: CommandInteraction) {
        if(!this.playerCommandCheckPermission(interaction)) return;

        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        guildManager.player.skip();

        interaction.reply({
            embeds: [
                this.getExtendedEmbed({
                    description: `${this.config.nickname}????????????????????????`
                }, interaction.guild)
            ]
        });
    }

    public async executeStop(interaction: CommandInteraction) {
        if(!this.playerCommandCheckPermission(interaction)) return;

        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        guildManager.player.stop();

        interaction.reply({
            embeds: [
                this.getExtendedEmbed({
                    description: `${this.config.nickname}????????????????????????`
                }, interaction.guild)
            ]
        });
    }

    public async executeLeave(interaction: CommandInteraction) {
        if(!this.playerCommandCheckPermission(interaction)) return;

        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        guildManager.player.reset();

        interaction.reply({
            embeds: [
                this.getExtendedEmbed({
                    description: "????????????"
                }, interaction.guild)
            ]
        });
    }

    public async executeJoin(interaction: CommandInteraction) {
        if(!this.playerCommandCheckPermission(interaction, false)) return;

        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        const member = interaction.member!! as GuildMember;
        const channel = member.voice.channel!!;
        guildManager.voiceController.joinChannel(channel);

        interaction.reply({
            embeds: [
                this.getExtendedEmbed({
                    description: "????????????????????????"
                }, interaction.guild)
            ]
        });
    }

    public async executePause(interaction: CommandInteraction) {
        if(!this.playerCommandCheckPermission(interaction)) return;

        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        guildManager.player.pause();

        interaction.reply({
            embeds: [
                this.getExtendedEmbed({
                    description: "????????????????????????"
                }, interaction.guild)
            ]
        });
    }

    public async executeResume(interaction: CommandInteraction) {
        if(!this.playerCommandCheckPermission(interaction)) return;

        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        guildManager.player.resume();

        interaction.reply({
            embeds: [
                this.getExtendedEmbed({
                    description: "????????????????????????"
                }, interaction.guild)
            ]
        });
    }

    public async executeLoop(interaction: CommandInteraction) {
        if(!this.playerCommandCheckPermission(interaction)) return;

        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        const options = interaction.options;
        const mode = options.getString("mode", true) as "none" | "queue" | "track";

        guildManager.player.loopMode = LoopMode[mode];

        const loopModeMessages = {
            none: `${this.config.nickname}????????????????????????????????????`,
            queue: `${this.config.nickname}????????? DD ?????????????????????????????????`,
            track: `${this.config.nickname}????????????????????????????????????????????????`
        };

        interaction.reply({
            embeds: [
                this.getExtendedEmbed({
                    description: loopModeMessages[mode]
                }, interaction.guild)
            ]
        });
    }

    public async executeList(interaction: CommandInteraction) {
        if(!this.playerCommandCheckPermission(interaction)) return;

        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        const player = guildManager.player;

        let queue = player.queue.items.map((item, i) => {
            let result = `${i+1}. ${item.meta.title}`;
            if(player.currentPlaying == i) {
                result = "  ???????????? ??????\n" + result + "\n  ???????????? ???";
            }
            return result;
        }).join("\n");

        if(queue.length == 0) {
            queue = "???????????????...O_Q";
        } else {
            queue = "```" + queue + "```";
        }

        interaction.reply({
            embeds: [
                this.getExtendedEmbed({
                    description: queue
                }, interaction.guild)
            ]
        });
    }

    public async executeClear(interaction: CommandInteraction) {
        if(!this.playerCommandCheckPermission(interaction)) return;

        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        guildManager.player.clearQueue();

        interaction.reply({
            embeds: [
                this.getExtendedEmbed({
                    description: `?????????${this.config.nickname}???????????????????????????`
                }, interaction.guild)
            ]
        });
    }

    public async executeRemove(interaction: CommandInteraction) {
        if(!this.playerCommandCheckPermission(interaction)) return;

        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        const options = interaction.options;
        const index = options.getInteger("index", true) - 1;

        if(index < 0 || index + 1 > guildManager.player.queue.count) {
            interaction.reply({
                embeds: [
                    this.getExtendedEmbed({
                        description: `${this.config.nickname}?????????..OHQ`
                    }, interaction.guild)
                ]
            });
            return;
        }

        guildManager.player.removeQueue(index);

        interaction.reply({
            embeds: [
                this.getExtendedEmbed({
                    description: `????????????${this.config.nickname}??????????????????????????????`
                }, interaction.guild)
            ]
        });
    }

    public async executeJump(interaction: CommandInteraction) {
        if(!this.playerCommandCheckPermission(interaction)) return;

        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        const options = interaction.options;
        const index = options.getInteger("index", true) - 1;

        if(index < 0 || index + 1 > guildManager.player.queue.count) {
            interaction.reply({
                embeds: [
                    this.getExtendedEmbed({
                        description: `${this.config.nickname}?????????..OHQ`
                    }, interaction.guild)
                ]
            });
            return;
        }

        guildManager.player.jumpTo(index);

        interaction.reply({
            embeds: [
                this.getExtendedEmbed({
                    description: `${this.config.nickname}????????????????????????????????????`
                }, interaction.guild)
            ]
        });
    }

    public async handleMessageComponentInteraction(interaction: MessageComponentInteraction) {
        if(interaction.isButton()) {
            await this.handleButtonInteraction(interaction);
            return;
        }

        if(interaction.isSelectMenu()) {
            await this.handleSelectMenuInteraction(interaction);
            return;
        }
    }

    public async handleButtonInteraction(interaction: ButtonInteraction) {

    }

    public async handleSelectMenuInteraction(interaction: SelectMenuInteraction) {
        
    }

    public async handleContextMenuInteraction(interaction: ContextMenuInteraction) {

    }

    public async reload() {
        this.config.load();

        this.guildManagers.forEach(m => {
            m.config.load();
            this.registerGuildSlashCommands(m.guild);
        });
    }

    public getThemeColor(guild: Guild | null = null): number {
        if(!guild) return 0xd8993b;
        return this.getGuildManager(guild)?.getMainColor() ?? 0xd8993b;
    }

    public getEmbedBase(guild: Guild | null = null): MessageEmbedOptions {
        return {
            color: this.getThemeColor(guild),
            author: {
                name: this.api.user?.username,
                icon_url: this.api.user?.avatarURL() ?? undefined
            }
        };
    }

    public getExtendedEmbed(embed: MessageEmbedOptions, guild: Guild | null = null): MessageEmbedOptions {
        return {
            ...this.getEmbedBase(guild),
            ...embed
        };
    }

    public async exit() {
        this.canAcceptConsoleInput = false;
        if(this.activityInterval) {
            clearInterval(this.activityInterval);
            this.activityInterval = null;
        }

        Logger.info("Exiting...");
        this.api.destroy();
        process.exit(0);
    }

    public failedToSendMessage(name: string) {
        return (ex: any) => {
            Logger.error("Failed to send " + name + " message");
            console.log(ex);
        };
    }

    public failedToEditMessage(name: string) {
        return (ex: any) => {
            Logger.error("Failed to edit " + name + " message");
            console.log(ex);
        };
    }

    public failedToDeleteMessage(name: string) {
        return (ex: any) => {
            Logger.error("Failed to delete " + name + " message");
            console.log(ex);
        };
    }

    public failedToDeleteChannel(name: string) {
        return (ex: any) => {
            Logger.error("Failed to delete " + name + " channel");
            console.log(ex);
        };
    }

    public failedToCreateThread(name: string) {
        return (ex: any) => {
            Logger.error("Failed to create " + name + " thread");
            console.log(ex);
        };
    }

    public failedToAddThreadMember(name: string) {
        return (ex: any) => {
            Logger.error("Failed to sadd " + name + " thread member");
            console.log(ex);
        };
    }
}