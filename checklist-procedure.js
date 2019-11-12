#!/usr/bin/env node

'use strict';

if (!process.argv[2]) {
	console.error('You must pass a valid file path into this script');
	process.exit(1);
}

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const ipvFile = path.join(process.cwd(), process.argv[2]);
// const xmlFile = path.join(process.cwd(), '/3.2.341_M_12026.xml');
const ipvFileDir = path.dirname(ipvFile);

const projectDir = path.dirname(ipvFileDir);

const tasksDir = path.join(projectDir, 'tasks'); // should be called activityDir need to fix when merging
const procsDir = path.join(projectDir, 'procedures');
const imagesDir = path.join(projectDir, 'images');

var indent = 0;
var outPut = '';

if (!fs.existsSync(tasksDir)) {
	fs.mkdirSync(tasksDir);
}
if (!fs.existsSync(procsDir)) {
	fs.mkdirSync(procsDir);
}
if (!fs.existsSync(procsDir)) {
	fs.mkdirSync(imagesDir);
}

const basename = path.basename(ipvFile, path.extname(ipvFile));

if (!['.xml'].includes(path.extname(ipvFile))) {
	// Should perform more specific test to check xml is using IPV format
	console.error(`${ipvFile} does not appear to be an XML file`);
	process.exit(1);
}

// Checks if file path exists
if (!fs.existsSync(ipvFile)) {
	console.error(`${ipvFile} is not a valid file`);
	process.exit(1);
}

// todo fixme remove this if truly unneeded. arrayUnique is unused in this file.
// const arrayUnique = (value, index, self) => {
// return self.indexOf(value) === index;
// };

try {
	console.log('Loading XML');
	var $ = cheerio.load(fs.readFileSync(process.argv[2]));
	console.log('XML loaded');
} catch (err) {
	throw new Error(err);
}

// todo fixme remove this if truly unneeded. taskHeader is unused in this file.
// taskHeader is equivalent to procedure header for IPV procedures.
// const taskHeader = `roles:
//   - name: crewA
//     description: TBD
//     duration:
//       minutes: 30
//   - name: crewB
//     description: TBD
//     duration:
//       minutes: 30
// steps:
// `;

function stepCheck(step) {
	var stepYaml = '';

	$(step).children().each(function(index, element) {
		var instruction;

		var tagType = $(element).prop('tagName');
		if (tagType === 'STEPTITLE') {
			var text = $(element).find('> Text').text().trim().replace(/\s+/g, ' ');
			var locationInfo = $(element).find('LocationInfo').text().trim().replace(/\s+/g, ' ');
			instruction = $(element).find('Instruction').text().trim().replace(/\s+/g, ' ');
			// What is navInfo used for?
			var navInfo = $(element).find('NavInfo').text().trim().replace(/\s+/g, ' ');

			stepYaml += `${indent}- title: ${text}\n${indent} locationInfo: ${locationInfo}\n${indent} instruction: ${instruction}\n${indent} navInfo: ${navInfo}`;
		} else if (tagType === 'CLARIFYINGINFO') {
			var type = $(element).attr('infotype');
			// Not sure if we need this one.
			var isNumbered = $(element).attr('isnumbered');
			var itemid = $(element).attr('itemid');
			// Might need to pull html for content to get symbols
			var content = $(element).text().trim().replace(/\s+/g, ' ');

			stepYaml += `${indent}- ${type}: ${content}\n${indent} isNumbered: ${isNumbered}\n${indent} itemid: ${itemid}`;
		} else if (tagType === 'STEPCONTENT') {
			instruction = $(element).find('Instruction').text().trim().replace(/\s+/g, ' ');
			if (instruction !== '') {
				stepYaml += `${indent}- step: ${instruction}`;
			}

			// CHECK FOR IMAGES
			$(element).children().each(function(index, element) {
				var tagType = $(element).prop('tagName');

				if (tagType === 'IMG') {
					var alt = $(element).find('ImageReference').attr('alt');
					var height = $(element).find('ImageReference').attr('height');
					var width = $(element).find('ImageReference').attr('width');
					var source = $(element).find('ImageReference').attr('src');
					var text = $(element).find('ImageReference > ImageTitle > Text').text().trim().replace(/\s+/g, ' ');

					stepYaml += `${indent}- image: ${source}\n${indent} text: ${text}\n${indent} width: ${width}\n${indent} height: ${height}\n${indent} alt: ${alt}`;
				}
			});

		} else if (tagType === 'STEP') {
			indent += 1;
			stepYaml += stepCheck(element);

		}

	});

	return stepYaml;
}

function formatMetaData(meta) {
	return `- metaData:
    procType: ${meta.procType}
    status: ${meta.status}
    date: ${meta.date}
    uniqueID: ${meta.uniqueId}
    book: ${meta.book}
    applicability: ${meta.applicability}
    version: ${meta.version}
    proceCode: ${meta.procCode}\n`;
}

function parseTag(tagQuery) {
	outPut = '';

	$(`ChecklistProcedure > ${tagQuery}`).each(function(index, element) {
		var content;
		var tagType = $(element).prop('tagName');

		if (tagType === 'SCHEMAVERSION') {
			content = $(element).text().trim().replace(/\s+/g, ' ');
			outPut = `schemaVersion: ${content}\n`;
		} else if (tagType === 'AUTHORINGTOOL') {
			content = $(element).text().trim().replace(/\s+/g, ' ');
			outPut = `authoringTool: ${content}\n`;
		} else if (tagType === 'METADATA') {
			var procType = $(element).attr('proctype');
			var status = $(element).attr('status');
			var date = $(element).find('Date').text().trim().replace(/\s+/g, ' ');
			var uniqueId = $(element).find('UniqueId').text().trim().replace(/\s+/g, ' ');
			var book = $(element).find('Book').text().trim().replace(/\s+/g, ' ');
			var applicability = $(element).find('Applicability').text().trim().replace(/\s+/g, ' ');
			var version = $(element).find('Version').text().trim().replace(/\s+/g, ' ');
			var procCode = $(element).find('ProcCode').text().trim().replace(/\s+/g, ' ');
			outPut = formatMetaData({
				procType: procType,
				status: status,
				date: date,
				uniqueId: uniqueId,
				book: book,
				applicability: applicability,
				version: version,
				procCode: procCode
			});
		} else if (tagType === 'PROCTITLE') {
			var title = $(element).find('text').first().text().trim().replace(/\s+/g, ' ');
			var procNumber = $(element).find('ProcNumber').text().trim().replace(/\s+/g, ' ');
			outPut = `procedure_name: ${title}\nprocedure_number: ${procNumber}\n`;
		} else if (tagType === 'TIMEREQUIREMENT') {
			content = $(element).html().trim().replace(/\s+/g, ' ');
			outPut = `timeRequirement: ${content}\n`;
			// NEED TO FIND OUT IF THIS IS USED AND WHAT THE
		} else if (tagType === 'PROCEDUREOBJECTIVE') {
			content = $(element).text().trim().replace(/\s+/g, ' ');
			outPut = `procedure_objective: ${content}\n`;
		} else if (tagType === 'ITEMIZEDLIST') {
			var label = $(element).find('ListTitle').text().trim().replace(/\s+/g, ' ');
			label = label.toLowerCase().replace(':', '').replace(' ', '_');
			outPut += (`- ${label}:\n`);
			$(element).find('Para').each(function(index, element) {
				var content = $(element).html().trim().replace(/\s+/g, ' ');
				outPut += '    ' + content + '\n';
			});

		// Add Tools/Parts Materials
		} else if (tagType === 'STEP') {
			indent += 1;
			outPut += stepCheck(element);
		}

	});

	return outPut;

}

var procedure = parseTag('SchemaVersion');
procedure += parseTag('AuthoringTool');
procedure += parseTag('MetaData');
procedure += parseTag('ProcTitle');
procedure += parseTag('TimeRequirement');
procedure += parseTag('ProcedureObjective');
procedure += parseTag('ItemizedList');
fs.writeFileSync(path.join(procsDir, `${basename}.yml`), procedure);
var task = parseTag('Step');
fs.writeFileSync(path.join(tasksDir, `${basename}.yml`), task);
