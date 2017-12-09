const Nightmare = require('nightmare');
const prompt = require('prompt');
const fs = require('fs');
const archiver = require('archiver');
const process = require('process');

const nightmare = Nightmare({ show: true }).viewport(2000, 1000);

const hint = 'Money must be a number!';
const schema = {
  properties: {
    moneyUnit: {
      description: 'Input the unit of money (RMB by default)',
      required: false,
    },
    bc: {
      description: 'If both cooperation',
      type: 'number',
      message: hint,
      required: true
    },
    bb: {
      description: 'If both betray',
      type: 'number',
      message: hint,
      required: true
    },
    bt: {
      description: 'If betraied the opponent',
      type: 'number',
      message: hint,
      required: true
    },
    by: {
      description: 'If betraied by opponent',
      type: 'number',
      message: hint,
      required: true
    },
  }
};

capture_pages = (nightmare, list, config) => {
  console.log(`[INFO] generating ${list[0].filename}`);

  let next = list;
  next.shift();

  if (!next.length) {
    nightmare.end();
    console.log(`[STAT] All images was generated, will zip your files now.`);
    zip_file(config);
  } else {
    nightmare.goto(list[0].url).screenshot(list[0].filename, {x: 0, y: 0, width: 1200, height: 675}).then(() => {
      capture_pages(nightmare, next, config);
    });
  }
}

zip_file = config => {
  let output = fs.createWriteStream('result.zip');
  let archive = archiver('zip');
  
  output.on('close', function() {
    console.log(`[INFO] ${archive.pointer()} total bytes`);
    console.log('[INFO] Archiver has been finalized and the output file descriptor has closed.');
    console.log(`[INFO] Cleaning the temp files.`);
    remove_dir('tmp');
    console.log(`[INFO] Task done.`);
    process.exit();
  });
  
  archive.on('warning', function(err) {
    if (err.code === 'ENOENT') {
      console.log(`[WARR] ${err.message}`)
    } else {
      throw err;
    }
  });
  
  archive.on('error', function(err) {
    throw err;
  });
  
  archive.pipe(output);
  archive.append(config.money.toString(), { name: 'server/config' });
  archive.directory(`tmp/`, false);
  
  archive.finalize();
}

remove_dir = path => {
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach(function(file, index){
      var curPath = path + "/" + file;
      if (fs.lstatSync(curPath).isDirectory()) {
        remove_dir(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
}

main = () => {
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

                                         The resource generator of PD experiment.


  `);
  try{
    fs.mkdirSync('./tmp');
    fs.mkdirSync('./tmp/client');
    fs.mkdirSync('./tmp/client/assets');
    fs.mkdirSync('./tmp/client/assets/images');
    fs.mkdirSync('./tmp/server');
  } catch(e) {
    console.log(`[WARR] ${e.message}`);
  }
  console.log();
  prompt.start();
  prompt.get(schema, function (err, result) {
    console.log('');
  
    const money = [result.by, result.bc, result.bb, result.bt];
    const unit = result.moneyUnit ? result.moneyUnit : '￥';
    const selectionFilenames = ['frame', 'selection11', 'selection01', 'selection10', 'selection00'];
    let files = [
      {
        url: `file://${__dirname}/asset/partial/frame.html#`,
        filename: `${__dirname}/tmp/client/assets/images/error.png`
      }
    ];
  
    for(let i = 0; i <= 4; i++) {
      files.push({
        url: `file://${__dirname}/asset/partial/frame.html#${money.toString()}.${i}.${unit}:-1`,
        filename: `${__dirname}/tmp/client/assets/images/${selectionFilenames[i]}.png`
      });
    }
  
    for(let i = 0; i <= 4; i++) {
      files.push({
        url: `file://${__dirname}/asset/partial/frame.html#${money.toString()}.${i}.${unit}:${i + 1}`,
        filename: `${__dirname}/tmp/client/assets/images/guide${i + 3}.png`
      });
    }
  
    capture_pages(nightmare, files, {money});
  });
}

main();