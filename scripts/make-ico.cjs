const fs=require('node:fs'),path=require('node:path');const dir=process.argv[2],out=process.argv[3];
const sizes=[16,24,32,48,64,128,256],imgs=sizes.map(s=>fs.readFileSync(path.join(dir,s+'.png')));
const header=Buffer.alloc(6);header.writeUInt16LE(0,0);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
let offset=6+16*sizes.length;const entries=sizes.map((s,i)=>{const e=Buffer.alloc(16);e.writeUInt8(s===256?0:s,0);e.writeUInt8(s===256?0:s,1);e.writeUInt8(0,2);e.writeUInt8(0,3);e.writeUInt16LE(1,4);e.writeUInt16LE(32,6);e.writeUInt32LE(imgs[i].length,8);e.writeUInt32LE(offset,12);offset+=imgs[i].length;return e;});
fs.writeFileSync(out,Buffer.concat([header,...entries,...imgs]));console.log('ico',fs.statSync(out).size);
