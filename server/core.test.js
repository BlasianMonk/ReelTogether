import test from 'node:test';
import assert from 'node:assert/strict';
import {clean,safeFile,makeTicket,verifyTicket,clampTime,id} from './core.js';
test('sanitize user-facing text',()=>assert.equal(clean('<Hi>',10),'Hi'));
test('safe file names',()=>assert.equal(safeFile('../abc.mp4'),'.._abc.mp4'));
test('room tickets are signed',()=>{const room=id();const token=makeTicket(room,'secret');assert.equal(verifyTicket(token,'secret'),room);assert.equal(verifyTicket(token,'other'),null);});
test('playback time is bounded',()=>{assert.equal(clampTime(-4),0);assert.equal(clampTime(900,120),120);});
