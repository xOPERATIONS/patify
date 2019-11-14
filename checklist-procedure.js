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
const ipvFileDir = path.dirname(ipvFile);

const projectDir = path.dirname(ipvFileDir);

const tasksDir = path.join(projectDir, 'tasks'); // should be called activityDir need to fix when merging
const procsDir = path.join(projectDir, 'procedures');
const imagesDir = path.join(projectDir, 'images');

var indent = '';
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
	var $ = cheerio.load(
		fs.readFileSync(process.argv[2]),
		{
			xmlMode: true,
			lowerCaseTags: true
		}
	);
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

// TODO create cleanup function to escape ", replace symbols
// .replace("Microsoft", "W3Schools");

function stepCheck(step) {
	var stepYaml = '';

	$(step).children().each(function(index, element) {
		var instruction;
		var tagType = $(element).prop('tagName');
		var itemid;

		if (tagType.toLowerCase() === 'steptitle') {
			var text = $(element).find('> text').text().trim().replace(/\s+/g, ' ').replace('"', '\\"');
			var locationInfo = $(element).find('locationInfo').text().trim().replace(/\s+/g, ' ').replace(/"/g, '\\"');
			// todo find and replace all symbol/center tags to {{templates}}
			instruction = $(element).find('instruction').text().trim().replace(/\s+/g, ' ');
			instruction = instruction.replace(/"/g, '\\"');
			// What is navInfo used for?
			var navInfo = $(element).find('navInfo').text().trim().replace(/\s+/g, ' ').replace('"', '\\"');

			stepYaml += `${indent}- title: "${text}"\n`;
			if (locationInfo !== '') {
				stepYaml += `${indent}  locationInfo: "${locationInfo}"\n`;
			}
			if (instruction !== '') {
				stepYaml += `${indent}  instruction: "${instruction}"\n`;
			}
			if (navInfo !== '') {
				stepYaml += `${indent}  navInfo: "${navInfo}"\n`;
			}

		} else if (tagType.toLowerCase() === 'clarifyinginfo') {
			var type = $(element).attr('infoType').replace('"', '\\"');
			// Not sure if we need this one.
			// var isNumbered = $(element).attr('isnumbered');
			itemid = $(element).attr('itemId').replace('"', '\\"');
			// Might need to pull html for content to get symbols
			var content = $(element).text().trim().replace(/\s+/g, ' ').replace('"', '\\"');

			stepYaml += `${indent}- ${type}: "${content}"\n${indent}  itemid: ${itemid}\n`;
		} else if (tagType.toLowerCase() === 'stepcontent') {
			instruction = $(element).find('instruction').text().trim().replace(/\s+/g, ' ');
			instruction = instruction.replace(/"/g, '\\"');
			itemid = $(element).attr('itemId').replace('"', '\\"');
			if (instruction !== '') {
				stepYaml += `${indent}  - step: "${instruction}"\n${indent}    itemid: ${itemid}\n`;

			}

			// CHECK FOR IMAGES
			$(element).children().each(function(index, element) {
				var tagType = $(element).prop('tagName');

				if (tagType.toLowerCase() === 'image') {
					var alt = $(element).find('imagereference').attr('alt');
					var height = $(element).find('imagereference').attr('height');
					var width = $(element).find('imagereference').attr('width');
					var source = $(element).find('imagereference').attr('source');
					var text = $(element).find('imagetitle > text').text().trim().replace(/\s+/g, ' ');

					stepYaml += `${indent}  - image: "${source}"\n${indent}    text: "${text}"\n${indent}    width: ${width}\n${indent}    height: ${height}\n${indent}    alt: "${alt}"\n`;
				}
			});

		} else if (tagType.toLowerCase() === 'step') {
			indent += '  ';
			stepYaml += stepCheck(element);

		}
		indent = '';

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

		if (tagType.toLowerCase() === 'schemaversion') {
			content = $(element).text().trim().replace(/\s+/g, ' ');
			outPut = `schemaVersion: ${content}\n`;
		} else if (tagType.toLowerCase() === 'authoringtool') {
			content = $(element).text().trim().replace(/\s+/g, ' ');
			outPut = `authoringTool: ${content}\n`;
		} else if (tagType.toLowerCase() === 'metadata') {
			var procType = $(element).attr('proctype');
			var status = $(element).attr('status');
			var date = $(element).find('date').text().trim().replace(/\s+/g, ' ');
			var uniqueId = $(element).find('uniqueid').text().trim().replace(/\s+/g, ' ');
			var book = $(element).find('book').text().trim().replace(/\s+/g, ' ');
			var applicability = $(element).find('applicability').text().trim().replace(/\s+/g, ' ');
			var version = $(element).find('version').text().trim().replace(/\s+/g, ' ');
			var procCode = $(element).find('proccode').text().trim().replace(/\s+/g, ' ');
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
		} else if (tagType.toLowerCase() === 'proctitle') {
			var title = $(element).find('text').first().text().trim().replace(/\s+/g, ' ');
			var procNumber = $(element).find('procnumber').text().trim().replace(/\s+/g, ' ');
			outPut = `procedure_name: ${title}\nprocedure_number: ${procNumber}\n`;
		} else if (tagType.toLowerCase() === 'timerequirement') {
			content = $(element).html().trim().replace(/\s+/g, ' ');
			outPut = `timeRequirement: ${content}\n`;
			// NEED TO FIND OUT IF THIS IS USED AND WHAT THE
		} else if (tagType.toLowerCase() === 'procedureobjective') {
			content = $(element).text().trim().replace(/\s+/g, ' ');
			outPut = `procedure_objective: ${content}\n`;
		} else if (tagType.toLowerCase() === 'itemizedlist') {
			var label = $(element).find('listtitle').text().trim().replace(/\s+/g, ' ');
			label = label.toLowerCase().replace(':', '').replace(' ', '_');
			outPut += (`- ${label}:\n`);
			$(element).find('Para').each(function(index, element) {
				var content = $(element).html().trim().replace(/\s+/g, ' ');
				outPut += '    ' + content + '\n';
			});

		// Add Tools/Parts Materials
		} else if (tagType.toLowerCase() === 'step') {
			outPut += stepCheck(element);
		}

	});

	return outPut;

}

// FIXME TESTING SYMBOL TAG SELECTING
$('Symbol:parent').each(function(element) {
	var nameTest = element.innerHTML;
	console.log(nameTest);
});

var procedure = parseTag('schemaversion');
procedure += parseTag('authoringtool');
procedure += parseTag('metadata');
procedure += parseTag('ProcTitle');
procedure += parseTag('timerequirement');
procedure += parseTag('procedureobjective');
procedure += parseTag('itemizedlist');
fs.writeFileSync(path.join(procsDir, `${basename}.yml`), procedure);
var task = parseTag('step');
fs.writeFileSync(path.join(tasksDir, `${basename}.yml`), task);
