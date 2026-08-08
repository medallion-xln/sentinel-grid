import { loadProductionConformanceExpansion } from './production-conformance-context.mjs';
const context = await loadProductionConformanceExpansion();
console.log(JSON.stringify(context.report, null, 2));
if (!context.report.pass) process.exitCode = 1;
