const fs = require('fs');
const net = require('net');
const process = require('process');
const csvStringify = require('csv-stringify');

const port = 2333;
//const host = '127.0.0.1';
//const host = '172.22.122.51';
const host = '192.168.1.1';
const trgClient = host;
const moneyConfig = fs.readFileSync('config', {encoding: 'utf8'}).split(',').map(parseFloat);

const blocks = [5, 20, 20, 20];

let currentBlock = -1;
let exportFileName = false;

// Player object contans: 
// ip           the IP address of this player
// totalMoney   total money of this player
// actions      the actions this player made
// moneyFloat   the floating track of money
// client       socks object

let players = {};
let trigger;

let currentTrail = {
  id: 0,
  actions: {

  }
};

let readyStat = {slide: {}, experiment: {}};
let finStat = {};

let gaming = false;
let started = false;
let finishedSlide = false;

const trailManager = (client, parameter) => {
  if(!gaming) {
    client.write('RF'); // Refuse the desicion making action because the game didn't get started.
    console.log(`[WARR] Refused the request from ${client.remoteAddress}`);
    return false;
  }

  let endLoop = false;
  let decision = parseInt(parameter[0]); // 1 means cooperation, 0 means betrayal.

  currentTrail.actions[client.remoteAddress] = decision;
  
  client.write('DR'); //Decision received.

  if(Object.keys(currentTrail.actions).length >= 2) {
    currentTrail.id ++;
    
    if(currentTrail.id >= blocks[currentBlock]) {
      endLoop = true;
	    setTimeout(() => {
          Object.keys(players).forEach(
          player => players[player].client.write('UL')
        ); // Unlock the loop and end the experiment.
      }, 500);
    }

    judgeDecision();
  }

  if(endLoop) gaming = false;
}

const judgeDecision = () => {
  let playerIps = Object.keys(currentTrail.actions);
  let decisions = playerIps.map(player => currentTrail.actions[player]);
  let result = [];

  if(decisions[0] === decisions[1]) {
    let bothMoney = decisions[0] === 1 ? moneyConfig[1] : moneyConfig[2];
    Object.keys(players).forEach(player => {
      result.push({
        player,
        action: decisions[0],
        otherSideAction: decisions[0],
        floating: bothMoney,
      });
    });  
  } else {
    result.push({
      player: playerIps[decisions.indexOf(0)],
      action: 0,
      otherSideAction: 1,
      floating: moneyConfig[3]
    });
    result.push({
      player: playerIps[decisions.indexOf(1)],
      action: 1,
      otherSideAction: 0,
      floating: moneyConfig[0]
    });
  }

  result.forEach(resultItem => {
    let player = players[resultItem.player];
    let playerLog = player.log;

    playerLog.totalMoney += resultItem.floating;
    playerLog.moneyFloat.push(resultItem.floating);
    playerLog.actions.push(resultItem.action);

    // Write the result to socket, the result contains following information:
    // RS                   A marker tells  the client that this command is a result
    // Round id             The id of this round
    // Action               The action this player made
    // Other side action    The action another player made
    // Money float          The player get how much money
    // Total money          How much the current player have now
    setTimeout(() => {
      player.client.write(`RS ${currentTrail.id} ${resultItem.action} ${resultItem.otherSideAction} ${resultItem.floating} ${playerLog.totalMoney}`);
    }, 1000);
  });

  console.log('[SEND] Sent the result command.');
  currentTrail.actions = {};
}

const handleDisconnect = client => {
  if (gaming) {
    console.log(`[WARN] A PLAYER DISCONNECTED WHILE THE EXPERIMENT IS GOING ON! ${client.remoteAddress}`);
    players[client.remoteAddress].connect = false;
  } else {
    console.log(`[CONN] Client disconnected: ${client.remoteAddress}`);
    if(!started) delete players[client.remoteAddress];
  }
}

const handleType = (client, parameter) => {
  if(parameter[0] === 'exp') {
    let playerCount = Object.keys(players).length;
    
    if(currentBlock === -1) {
      console.log('[WARN] The connection was refused because the experiment has not been set up.');
      client.write('NR'); // The experiment program is not ready, end connection.
      client.end();
    } else if(playerCount >= 2) {
      console.log('[WARR] More than 2 experiment client connected, the last one was disconnected.');
      client.write('MR'); // Maxmium players reached, end connection.
      client.end();
    } else {
      players[client.remoteAddress] = {
        ip: client.remoteAddress,
        connect: true,
        log: [],
        client
      };
    
      players[client.remoteAddress].log = {
          totalMoney: 0,
          actions: [],
          moneyFloat: [],
      };
      
      client.write(`TR ${currentBlock}`); // Tell the client to config current block.
      console.log(`[INFO] ${client.remoteAddress} was verified as a psychoPy client!`);
    }

    if(Object.keys(players).length >= 2) {
      started = true;
      setTimeout(() => {
        console.log('[STAT] The experiment will begin!');
        
        Object.keys(players).forEach(player => {
          players[player].client.write('ST');
        })
      }, 5000);
    }
  } else if (parameter[0] === 'trg') {
    trigger = client;
    
    setTimeout(() => {
      trigger.write('\r\n');
      trigger.write('LK\r\n');
    }, 500);

    console.log(`[INFO] ${client.remoteAddress} was verified as a ezNirsTrigger!`);
  } else if (parameter[0] == 'dbg') {
    console.log(`[INFO] ${client.remoteAddress} was verified as a debugger!`);
    console.log(`[INFO] Will start testing the signal stability now!`);
    client.write('ST\r\n');
  } else {
    client.write('UNC'); // Unknown client.
    console.log(`[WARN] ${client.remoteAddress} didn't pass the client verification.`);
    client.end();
  }
}

const handleReady = client => {
  let roundId = (finishedSlide || currentBlock !== 0) ? 'experiment' : 'slide';
  
  readyStat[roundId][client.remoteAddress] = true;
  let playerCount = Object.keys(readyStat[roundId]).length;

  if(playerCount >= 2) {
    if(!gaming && trigger)
      trigger.write('ST\r\n');

    let screenHint = roundId === 'experiment' 
                     ? '[STAT] The routine will begin!'
                     : '[STAT] Will start showing introducting slides!';
    
    console.log(screenHint);
    setTimeout(() => {
      Object.keys(players).forEach(player => {
        players[player].client.write('ST'); // Start the experiemnt.
      })
    }, 1000);

    gaming = true;
	
	  if (!finishedSlide) finishedSlide = true;
  }
}

const handleFin = client => {
  finStat[client.remoteAddress] = true;

  console.log(`[INFO] Received finished signal from ${client.remoteAddress}, disconnecting it.`)
  client.end();

  if(Object.keys(finStat).length >= 2) {
    console.log('[STAT] All trails was finished, the result will be written to disk.');
    writeResult();
  }
}

const triggerManager = (client, parameter) => {
  if(!trigger) {
    console.log('[INFO] No trigger client found, ignored the command.');
    return
  }
  
  if (["c", "t", "d", "r"].indexOf(parameter[0]) !== -1) {
    // c for cross mark, t for cross table, d for making decision screen
    if(client.remoteAddress === trgClient)
      trigger.write(`${parameter[0]}\r\n`);
  } else {
    let id = client.remoteAddress.split('.')[3];
    trigger.write(`${id}-${parameter[0]}\r\n`);
  }
}

const writeResult = () => {
  let result = [];
  
  for(let i = 0; i < blocks[currentBlock]; i++) {
    Object.keys(players).forEach(player => {
      result.push({
        'block': currentBlock, 
        'trail': i,
        'player': player.split('.')[3],
        'action': players[player].log.actions[i],
        'moneyFloat': players[player].log.moneyFloat[i],
        'roundMoney': players[player].log.totalMoney
      });
    });
  };

  csvStringify(result, 
    {
      columns: ['block', 'trail', 'player', 'action', 'moneyFloat', 'roundMoney'],
      header: true
    }, 
    (err, data) => {
      if(err) throw err;

      let d = new Date();
      let fileName = exportFileName 
        ? `./data/${exportFileName}-srv.csv`
        : `./data/${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}-${d.getMinutes()}-${d.getSeconds()}.csv`;
      console.log(`[INFO] Saved the file into: ${fileName}`);

      fs.writeFile(fileName, data, 'utf8', err => {
        if(err) throw err;
        
        console.log(`[INFO] Success!`);
        console.log(`\r\n############### DATA ###############\r\n${data.replace(',', ',\t')}####################################\r\n`);

        console.log(`[INFO] Summary for the current block`);
        console.log(`\r\n############## SUMMARY ##############`)
        Object.keys(players).forEach(player => {
          console.log(`Player${player.split('.')[3]}: ${players[player].log.totalMoney}`);
        });
        console.log(`#####################################`)

        if(trigger) {
          trigger.write('EN\r\n');
          trigger.write('UL\r\n');
          trigger.write(exportFileName ? `EX ${exportFileName}-trg\r\n` : 'EX\r\n');
          console.log(`[INFO] Dissonnecting the trigger server.`);
          trigger.end();
        }

        setTimeout (() => {
          console.log('[INFO] The server program will automatically shut down.');
          process.exit();
        }, 500);
      });
    });
}

const server = net.createServer();

server.on('connection', client => {
  console.log(`[CONN] Client connected: ${client.remoteAddress}`);

  setTimeout( () => client.write('WHO'), 500); //Ask for the client type.

  client.on('data', data => {
    const dataLineSet = data.toString().split("\r\n");
    dataLineSet.forEach(data => {
      if (data === '') return;

      const dataStr = data.replace(/\n/g, '').split(/[, ]/);
      const command = dataStr[0];
      const parameter = dataStr.slice(1);
  
      console.log(`[RECV] ${dataStr}`);
  
      switch(command) {
        case 'DC': // Making a decision.
          trailManager(client, parameter);
          break;
        case 'MK': // Making trigger.
          triggerManager(client, parameter);
          break;
        case 'RD': // Get ready.
          handleReady(client);
          break;
        case 'TP': // Verify client type.
          handleType(client, parameter);
          break;
        case 'CR': // Querying for current round.
          client.write(`CR ${currentTrail.id}`);
          break;
        case 'FIN': // Finished current block.
          handleFin(client);
          break;
        case 'FN': // Modify the filename.
          exportFileName = parameter[0];
          break;
        case 'DEBUG':
          //console.log(`[DEBG] Received debug message: ${parameter[0]}`);
          break;
        default:
          console.log('[????] Unknown command.');
      }
    })
  });
  
  client.on('end', () => {
    handleDisconnect(client);
  });

  client.on('error', error => {
    if(error.message === 'read ECONNRESET'){
      console.log(`[ERRO] CANT MAINTAIN THE CONNECTION! ${client.remoteAddress}`);
      handleDisconnect(client);
    } else
      console.log(`[ERRO] ${error.message}`);
  })
});

server.listen(port, host, client => {
  console.log(`
  __/\\\\\\\\\\\\\\\\\\\\\\\\\\____/\\\\\\\\\\\\\\\\\\\\\\\\_____/\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_____/\\\\\\\\\\\\\\\\\\\\\\___        
  _\\/\\\\\\/////////\\\\\\_\\/\\\\\\////////\\\\\\__\\/\\\\\\///////////____/\\\\\\/////////\\\\\\_       
   _\\/\\\\\\_______\\/\\\\\\_\\/\\\\\\______\\//\\\\\\_\\/\\\\\\______________\\//\\\\\\______\\///__      
    _\\/\\\\\\\\\\\\\\\\\\\\\\\\\\/__\\/\\\\\\_______\\/\\\\\\_\\/\\\\\\\\\\\\\\\\\\\\\\_______\\////\\\\\\_________     
     _\\/\\\\\\/////////____\\/\\\\\\_______\\/\\\\\\_\\/\\\\\\///////___________\\////\\\\\\______    
      _\\/\\\\\\_____________\\/\\\\\\_______\\/\\\\\\_\\/\\\\\\_____________________\\////\\\\\\___   
       _\\/\\\\\\_____________\\/\\\\\\_______/\\\\\\__\\/\\\\\\______________/\\\\\\______\\//\\\\\\__  
        _\\/\\\\\\_____________\\/\\\\\\\\\\\\\\\\\\\\\\\\/___\\/\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_\\///\\\\\\\\\\\\\\\\\\\\\\/___ 
         _\\///______________\\////////////_____\\///////////////____\\///////////_____

                                         The server side program of PD experiment.


  `);
  console.log('Socket Service Started successfuly!');
  console.log(`Host: ${host}`);
  console.log(`Port: ${port}`);
  console.log(`Config: ${moneyConfig.toString()}`);
  console.log();
  
  prompt('The current block is (1-4): ', data => {
    currentBlock = parseInt(data) - 1;
    console.log('Experiment configuration was successfully set up!');
    console.log(`Block:  ${data}`);
    console.log(`Trails: ${blocks[currentBlock]}`);
    console.log();
    console.log('Please start the PsychoPy client now.');
    console.log();
  });
  /*
  setInterval(() => {
    Object.keys(players).forEach(player => players[player].client.write('PING'));
  }, 2000);
*/
});

function prompt(question, callback) {
  const stdin = process.stdin;
  const stdout = process.stdout;

  stdin.resume();
  stdout.write(question);
  stdin.once('data', function(data) {
    callback(data.toString().trim());
  })
}
