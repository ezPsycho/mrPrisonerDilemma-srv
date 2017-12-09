const net = require('net');
let testing = false;

const server = new net.Socket();
server.connect(2333, '192.168.1.1');

server.on('data',  data => {
  const dataLineSet = data.toString().split("\r\n");
  
  dataLineSet.forEach(data => {
    if (data === '') return;
    const dataStr = data.replace(/\n/g, '').split(/[, ]/);
    const command = dataStr[0];
    const parameter = dataStr.slice(1);

    console.log(`[RECV] ${dataStr}`);
    
    switch(command) {
      case 'WHO':
        server.write(`TP dbg`);
        break;
      case 'ST':
        if (testing) break;
        testing = true;
        let packageCount = 0;
        let tick = setInterval(() => {
                      let msg = `DEBUG DPKG${packageCount}`;
                      //console.log(msg);
                      server.write(msg);
                      packageCount ++;
                      if (packageCount >= 1000) {
                        clearInterval(tick);
                        console.log(`[INFO] Finished debugging, the program will shut down now.`);
                        server.destroy();
                      }
                    },1);
      
        break;
      default:
        console.log('[????] Unknown command.');
    }
  });
});