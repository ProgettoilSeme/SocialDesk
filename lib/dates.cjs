'use strict';
function calendarDate(year,month,day){
 if(year<1900||year>9999||month<1||month>12||day<1||day>31)return null;
 const parsed=new Date(Date.UTC(year,month-1,day));
 if(parsed.getUTCFullYear()!==year||parsed.getUTCMonth()!==month-1||parsed.getUTCDate()!==day)return null;
 return`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
// Excel può memorizzare la stessa data come numero seriale, ISO (t="d") o testo.
// Le date di pubblicazione sono giorni di calendario: non spostarle per il fuso orario.
function excelDate(value,date1904=false){
 if(typeof value==='number'){
  if(!Number.isFinite(value)||value<0||value>2958465)return null;
  const serial=Math.floor(value);
  if(!date1904&&serial===60)return null; // Il 29/02/1900 fittizio di Excel non è un giorno reale.
  const epoch=Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:serial<60?31:30);
  const date=new Date(epoch+serial*86400000);
  return calendarDate(date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDate());
 }
 if(typeof value!=='string')return null;
 const text=value.trim();let match;
 if((match=/^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(text))){
  if(text.length>10&&!Number.isFinite(Date.parse(text)))return null;
  return calendarDate(Number(match[1]),Number(match[2]),Number(match[3]));
 }
 if((match=/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(text)))return calendarDate(Number(match[3]),Number(match[2]),Number(match[1]));
 if(/^\d{5,7}(?:\.\d+)?$/.test(text))return excelDate(Number(text),date1904);
 return null;
}
module.exports={excelDate};
