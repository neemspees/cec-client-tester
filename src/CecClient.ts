import { spawn, ChildProcessByStdio } from 'child_process';
import readline from 'readline';
import { EventEmitter, Readable, Writable } from 'stream';

export type VideoSource = 'self' | 'tv' | 'hdmi1' | 'hdmi2' | 'hdmi3' | 'hdmi4';
type SourceFrames = '1f:82:10:00' | '1f:82:20:00' | '1f:82:30:00' | '1f:82:40:00';

enum Vendor {
    Sony = '0f:87:08:00:46',
    Philips = '0f:87:00:90:3e',
    LG = '0f:87:00:e0:91',
    Unknown = 'unknown',
}

export default class CecClient {
    static readonly ERROR_EVENT_WAITER_TIMEOUT = 'Event waiter timed out';
    static readonly ERROR_FRAMES_NOT_MAPPABLE_TO_SOURCE = 'source frames not mapable';

    private static readonly EVENT_WAITING_FOR_INPUT = 'waiting_for_input';
    private static readonly EVENT_FRAMES_SOURCE = 'frames_source';
    private static readonly EVENT_FRAMES_VENDOR_ID = 'frames_vendor_id';

    private process: ChildProcessByStdio<Writable, Readable, null>|null = null;
    private eventBus: EventEmitter;

    constructor() {
        this.eventBus = new EventEmitter();
    }

    async spawn(): Promise<void> {
        this.process = spawn('cec-client', [], { stdio: ['pipe', 'pipe', 'ignore'] });
        this.process.once('close', this.handleProcessClose.bind(this));
        this.process.stdin.setDefaultEncoding('utf-8');

        const rl = readline.createInterface({
            input: this.process.stdout,
            crlfDelay: Infinity,
        });
        const lineListener = this.parseClientOutput.bind(this);
        rl.on('line', lineListener);
        rl.once('close', () => rl.removeListener('line', lineListener));

        await this.awaitCecEvent(CecClient.EVENT_WAITING_FOR_INPUT);
        console.log('Cec client started');
    }

    handleProcessClose(): void {
        console.log('Process closed');
    }

    kill() {
        if (this.process === null) {
            return;
        }

        const isKilled = this.process.kill();

        if (! isKilled) {
            throw new Error('Failed killing the cec client');
        }

        this.process = null;
    }

    public async changeSource(source: VideoSource) {
        // const ownSource = await this.setActiveSourceAndGetTXFrames();

        // if (source === ownSource || source === 'self') {
        //     return;
        // }

        const map = {
            'self': 'as',
            'tv': 'is',
            'hdmi1': 'tx 1f:82:10:00',
            'hdmi2': 'tx 1f:82:20:00',
            'hdmi3': 'tx 1f:82:30:00',
            'hdmi4': 'tx 1f:82:40:00',
        };

        const command = map[source];

        if (command === 'is' || command === 'as') {
            await this.command(command);
            return;
        }

        const vendor = await this.getTVVendor();

        await this.command(command);

        if (vendor === Vendor.Philips) {
            console.log('Handling switch source for Philips');
            await this.awaitCecEvent(CecClient.EVENT_WAITING_FOR_INPUT);
            await this.command('is');
        }

        if (vendor === Vendor.Sony) {
            console.log('Handling switch source for Sony');
            await this.awaitCecEvent(CecClient.EVENT_WAITING_FOR_INPUT);
            await this.setActiveSourceAndGetTXFrames();
            await this.command('is');
        }
    }

    public async setTVPowerOn(): Promise<void> {
        this.command('on 0');
    }

    public async setTVPowerStandby(): Promise<void> {
        this.command('standby 0');
    }

    public async getTVVendor(): Promise<Vendor> {
        this.command('tx 10:8c');
        const vendor = await this.awaitCecEvent<Vendor>(CecClient.EVENT_FRAMES_VENDOR_ID);

        return vendor;
    }

    /**
     * Sends as command and returns the tx frames for setting it as active source manually
     * Quick & Dirty (╯°□°）╯︵ ┻━┻
     */
    private async setActiveSourceAndGetTXFrames(): Promise<VideoSource> {
        this.command('as');
        const ownTXFrames = await this.awaitCecEvent<SourceFrames>(CecClient.EVENT_FRAMES_SOURCE);
    
        const map: {[key in SourceFrames]: VideoSource} = {
            '1f:82:10:00': 'hdmi1',
            '1f:82:20:00': 'hdmi2',
            '1f:82:30:00': 'hdmi3',
            '1f:82:40:00': 'hdmi4',
        };

        const source = map[ownTXFrames];

        if (! source) {
            throw new Error(CecClient.ERROR_FRAMES_NOT_MAPPABLE_TO_SOURCE);
        }

        return map[ownTXFrames];
    }

    private parseClientOutput(line: string): void {
        const handlers = [
            {
                needles: [ 'DEBUG', 'NOTICE' ],
                action: (line: string) => {
                    this.logResponse(line, false);
                },
            },
            {
                needles: [ 'waiting for input' ],
                action: () => {
                    this.logResponse('waiting for input');
                    this.eventBus.emit(CecClient.EVENT_WAITING_FOR_INPUT);
                },
            },
            {
                needles: [ '1f:82' ],
                action: (line: string) => {
                    const parsed = line.slice(-11);
                    this.logResponse(parsed);
                    this.eventBus.emit(CecClient.EVENT_FRAMES_SOURCE, parsed);
                },
            },
            {
                needles: [ '0f:87' ],
                action: (line: string) => {
                    const parsed = line.slice(-14);
                    this.logResponse(parsed);
                    this.eventBus.emit(CecClient.EVENT_FRAMES_VENDOR_ID, parsed);
                },
            },
        ];

        const matchinHandlers = handlers.filter(h => h.needles.filter(n => line.includes(n)).length > 0);

        if (matchinHandlers.length === 0) {
            return;
        }

        matchinHandlers[0].action(line.trim());
    }

    private async command(command: string): Promise<void> {
        this.logCommand(command);
        this.process.stdin.write(command);
    }

    private logCommand(data: string): void {
        console.log('[client' , '\x1b[33m', '->', '\x1b[0m',  'tv]:', '\x1b[33m', data, '\x1b[0m');
    }

    private logResponse(data: string, important: boolean = true): void {
        const colorCode = important ? '\x1b[36m' : '\x1b[2m';

        console.log('[client' , colorCode, '<-', '\x1b[0m',  'tv]:', colorCode, data, '\x1b[0m');
    }

    private async awaitCecEvent<T = void> (event: string, timeout: number = 5): Promise<T> {
        return this.awaitEvent<T>(this.eventBus, event, timeout);
    }

    private async awaitEvent<T = void> (eventEmitter: EventEmitter, event: string, timeout: number = 10): Promise<T> {
        return new Promise((res, rej) => {
            const handler = (e: T) => res(e);

            eventEmitter.once(event, handler);

            setTimeout(
                () => {
                    eventEmitter.removeListener(event, handler);
                    rej(CecClient.ERROR_EVENT_WAITER_TIMEOUT);
                },
                timeout * 1000
            );
        });
    }
}
