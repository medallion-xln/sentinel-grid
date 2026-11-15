// Successor preparation, Phase 3 fixtures: runs menu-validity-fixtures.mjs once and writes
// evidence/successor-v4/fixtures.json (wx). Development and spent worlds only.
import { resolve } from 'node:path';
import { runFixtures } from './menu-validity-fixtures.mjs';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { verifyOwnerLane, LANE } from './inherit.mjs';

assertSoleWriter(); const inh = verifyOwnerLane();
const results = runFixtures(), passed = results.filter((r) => r.pass).length;
const categories = [...new Set(results.map((r) => r.category))].sort();
const required = ['EMPTY', 'DUPLICATE', 'DISTINCT', 'IDENTITY', 'ORDER', 'EXCEPTIONAL', 'MULTI_DECISION', 'LATER_STEP'];
writeExclusive(resolve(LANE, 'evidence/successor-v4/fixtures.json'), { schema: 'STAGE3H_SUCCESSOR_MENU_VALIDITY_FIXTURES_V1', rule: 'STAGE3H_NATIVE_MENU_VALIDITY_V1', inheritanceHead: inh.head,
  passed, total: results.length, requiredCategoriesCovered: required.every((c) => categories.includes(c)), categories, results,
  verdict: passed === results.length && required.every((c) => categories.includes(c)) ? 'ALL_FIXTURES_PASS' : 'FIXTURE_FAILURE', registeredWorldsGenerated: 0, authority: 'R0' });
console.log(JSON.stringify({ passed, total: results.length, failed: results.filter((r) => !r.pass).map((r) => r.id) }));
