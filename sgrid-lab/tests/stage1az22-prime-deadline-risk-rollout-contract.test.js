#!/usr/bin/env node
'use strict';
const path=require('node:path');process.env.STAGE1AZ22_ROOT=path.resolve(__dirname,'..','..');process.env.STAGE1AZ22_AZL=path.join(process.env.STAGE1AZ22_ROOT,'public_html','azl');require(path.resolve(process.env.STAGE1AZ22_ZEKNOVA_TEST||path.join(__dirname,'stage1az22-shared-contract-test.cjs')));
