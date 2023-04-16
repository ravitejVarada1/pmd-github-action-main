const core = require('@actions/core');
const artifact = require('@actions/artifact');
const util = require('./util');
const sarif = require('./sarif');
const validator = require('./validator');
const annotations = require('./annotations');

const reportFormat = 'sarif';
const reportFile = 'pmd-report.sarif'

async function main() {
  let pmdInfo, modifiedFiles, execOutput, violations;
  let token = core.getInput('token', { required: true });
  let sourcePath = validator.validateSourcePath(core.getInput('sourcePath', { required: true }));
  try {
    pmdInfo = await util.downloadPmd(
      validator.validateVersion(core.getInput('version'), { required: true }),
      token,
      validator.validateDownloadUrl(core.getInput('downloadUrl'), { required: true })
    );

    if (core.getInput('analyzeModifiedFilesOnly', { required: true }) === 'true') {
      core.info(`Determining modified files in ${sourcePath}...`);
      modifiedFiles = await util.determineModifiedFiles(token, sourcePath);
      if (modifiedFiles !== undefined && modifiedFiles.length === 0) {
        core.info(`No modified files have been found in ${sourcePath} - exiting`);
        core.setOutput('violations', 0);
        return;
      }
    }

    execOutput = await util.executePmd(pmdInfo,
      modifiedFiles || sourcePath,
      validator.validateRulesets(core.getInput('rulesets', { required: true })),
      reportFormat, reportFile)

    core.info(`PMD exited with ${execOutput.exitCode}`);

    sarif.relativizeReport(reportFile);
    sarif.fixResults(reportFile);

    violations = sarif.countViolations(reportFile);
    core.setOutput('violations', violations);
    core.info(`PMD detected ${violations} violations.`);

    if (core.getInput('createGitHubAnnotations', { required: true}) === 'true') {
      const report = sarif.loadReport(reportFile);
      annotations.processSarifReport(report);
    }

    const artifactClient = artifact.create();
    await artifactClient.uploadArtifact('PMD Report', [reportFile], '.', {
      continueOnError: false
    });
  } catch (error) {
    core.setFailed(error.message || error);
  }
}

main();
