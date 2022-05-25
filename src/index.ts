import readline from 'readline';
import CecClient, { VideoSource } from './CecClient';

type Command = VideoSource | 'exit' | 'vendor' | 'standby' | 'on' | 'debug';

(async () => {
    console.log('---');
    console.log('cec-client tester');
    console.log('---');
    console.log('Commands: exit | vendor | standby | on | self | tv | hdmi1 | hdmi2 | hdmi3 | hdmi4 | debug');
    console.log('Initializing client...');

    const client = new CecClient();
    await client.spawn();

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const recursiveReadLine = () => {
        rl.question('Command: ', async (command: Command) => {
            const map: {[key in Command]: () => Promise<void>} = {
                'exit': async () => {
                    client.kill();
                    rl.close();
                },
                'vendor': async () => {
                    const vendor = await client.getTVVendor();
                    console.log(vendor.valueOf());
                },
                'standby': async () => {
                    await client.setTVPowerStandby();
                },
                'on': async () => {
                    await client.setTVPowerOn();
                },
                'self': async () => {
                    await client.changeSource('self');
                },
                'tv': async () => {
                    await client.changeSource('tv');
                },
                'hdmi1': async () => {
                    await client.changeSource('hdmi1');
                },
                'hdmi2': async () => {
                    await client.changeSource('hdmi2');
                },
                'hdmi3': async () => {
                    await client.changeSource('hdmi3');
                },
                'hdmi4': async () => {
                    await client.changeSource('hdmi4');
                },
                'debug': async () => {
                    client.debug = ! client.debug;
                },
            };

            try {
                const handler = map[command];

                if (handler) {
                    await handler();
                }

                console.error('Invalid command, choose one of: exit | vendor | standby | on | self | tv | hdmi1 | hdmi2 | hdmi3 | hdmi4 | debug');
            } catch (e) {
                console.error(e);
            }

            if (command === 'exit') {
                console.log('Bye!');
                return;
            }

            recursiveReadLine();
        });
    };
      
    recursiveReadLine();
})();
