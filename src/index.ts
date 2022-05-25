import readline from 'readline';
import CecClient, { VideoSource } from './CecClient';

(async () => {
    console.log('---');
    console.log('Cec tester');
    console.log('---');
    console.log('Commands: [exit | vendor | standby | on | self | tv | hdmi1 | hdmi2 | hdmi3 | hdmi4]');
    console.log('Initializing client...');

    const client = new CecClient();
    await client.spawn();

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const recursiveReadLine = () => {
        rl.question('Command: ', async (answer: VideoSource | 'exit' | 'vendor' | 'standby' | 'on') => {
            if (answer === 'exit') {
                client.kill();
                return rl.close();
            }

            if (answer === 'vendor') {
                const vendor = await client.getTVVendor();
                console.log(vendor.valueOf());

                return recursiveReadLine();
            }

            if (answer === 'standby') {
                await client.setTVPowerStandby();

                return recursiveReadLine();
            }

            if (answer === 'on') {
                await client.setTVPowerOn();

                return recursiveReadLine();
            }

            await client.changeSource(answer);

            recursiveReadLine();
        });
    };
      
    recursiveReadLine();
})();
