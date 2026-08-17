import { parseFileEi } from '@axiapps/axilog';
const ei = parseFileEi('test-fixtures/axilog/wvw-small.anon.zevtc', { everything: true });
console.log('player keys:', Object.keys(ei.players[0]).slice(0,25));
console.log('names:', ei.players.slice(0,5).map(p=>JSON.stringify(p.name)));
console.log('accounts:', ei.players.slice(0,3).map(p=>p.account));
// simulate the OLD dedupe
const allyNames = new Set(); let kept = 0;
for (const p of ei.players) {
  if (p?.isFake) continue;
  if (allyNames.has(p.name)) continue;
  if (!p?.combatReplayData?.positions?.length) continue;
  allyNames.add(p.name); kept++;
}
console.log('members the OLD buildMovementData would keep:', kept, 'of', ei.players.length);
