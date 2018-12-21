#!/usr/bin/env node
const simpleGit = require('simple-git');
const path = require('path');
const chalk = require('chalk');

const argv = require('yargs')
  .usage('Usage: $0 <action> <branch>')
  .command('action', 'Action to run: pull, checkout')
  .command('branch', 'Branch to use')
  .option('repositories', {
    alias: 'r',
    describe: 'Repositories to work on separated by a space',
    type: 'array'
  })
  .demandCommand(0, 'Please choose an action to run')
  .demandOption(['repositories'], 'Please provide the repositories to work on')
  .example('$0 pull', 'Pull from the tracking remote')
  .example('$0 checkout <branch>', 'Checkout the given branch').argv;

class Repo {
  constructor(path, paddingTarget = 0) {
    this.repository = simpleGit(path);
    this.repository._silentLogging = true;
    this.paddingTarget = paddingTarget;
  }

  pull() {
    return new Promise((resolve, reject) => {
      this.repository.status((err, status) => {
        if (err) {
          return reject(err);
        }
        if (!status.tracking) {
          return reject(new Error('No tracked branch for current branch ' + status.current));
        }
        this.repository.pull((err, result) => {
          if (err) {
            return reject(err);
          }
          const repoName = this.repository._baseDir.substr(this.repository._baseDir.lastIndexOf('/') + 1);

          let branchName = status.tracking;
          if (branchName !== 'origin/master') {
            branchName = chalk.yellow(branchName);
          }
          delete result.summary;
          this.repository.raw(['rev-list', 'HEAD..origin/master', '--count'], (err, count) => {
            if (err) {
              return reject(err);
            }
            const outputInfo = this._pullOutput(repoName, status, result, count.trim());

            return resolve(outputInfo);
          });
        });
      });
    });
  }

  checkout(branch) {
    return new Promise((resolve, reject) => {
      this.repository.fetch((err) => {
        if (err) {
          return reject(err);
        }

        this.repository.status((err, status) => {
          if (err) {
            return reject(err);
          }

          this.repository.branch((err, branches) => {
            if (err) {
              return reject(err);
            }
            if (!branches.all.includes(branch) && !branches.all.includes('remotes/origin/' + branch)) {
              branch = 'master';
            }
            this.repository.checkout(branch, (err) => {
              if (err) {
                return reject(err);
              }
              const repoName = this.repository._baseDir.substr(this.repository._baseDir.lastIndexOf('/') + 1);

              let output = chalk.cyan(rightPadding(repoName, this.paddingTarget));
              if (branch === status.current) {
                output += ' | -';
              } else {
                output += ' | ' + chalk.bold(status.current + ' ➜ ' + branch);
              }

              return resolve(output);
            });
          });
        });
      });
    });
  }

  upgrade() {
    return new Promise((resolve, reject) => {
      const repoName = this.repository._baseDir.substr(this.repository._baseDir.lastIndexOf('/') + 1);
      let output = chalk.cyan(rightPadding(repoName, this.paddingTarget));
      this.repository.raw(['rev-list', 'HEAD..origin/master', '--count'], (err, count) => {
        if (err) {
          return reject(err);
        }

        count = Number(count.trim());

        if (count === 0) {
          output += ' | 0';
          return resolve(output);
        }

        this.repository.status((err, status) => {
          if (err) {
            return reject(err);
          }

          const { current: currentBranch } = status;

          this.checkout('master')
            .then(() => {
              return this.pull();
            })
            .then(() => {
              return this.checkout(currentBranch);
            })
            .then(() => {
              this.repository.mergeFromTo('master', currentBranch, ['--no-edit'], () => {
                output += ' | ' + chalk.bold(count);
                return resolve(output);
              });
            })
            .catch((reason) => {
              console.error(chalk.red('Error while upgrading:\n'), reason);
            });
        });
      });
    });
  }

  _pullOutput(repoName, statusResult, pullResult, diffWithMaster) {
    const outputInfo = {
      repoName,
      branchName: statusResult.tracking.substring(statusResult.tracking.indexOf('/') + 1),
      insertions: 0,
      deletions: 0
    };
    for (const insertedFile of Object.keys(pullResult.insertions)) {
      outputInfo.insertions += pullResult.insertions[insertedFile];
    }
    for (const deletedFile of Object.keys(pullResult.deletions)) {
      outputInfo.deletions += pullResult.deletions[deletedFile];
    }

    let output = chalk.cyan(rightPadding(repoName, this.paddingTarget));
    output += ' | ';
    let insertions = leftPadding(outputInfo.insertions + '', 10);
    if (outputInfo.insertions > 0) {
      insertions = chalk.bold(insertions);
    }
    output += insertions;
    output += ' | ';
    let deletions = leftPadding('' + outputInfo.deletions + '', 9);
    if (outputInfo.deletions > 0) {
      deletions = chalk.bold(deletions);
    }
    output += deletions;
    output += ' | ';
    let diff = leftPadding('' + diffWithMaster + '', 10);
    if (diffWithMaster > 0) {
      diff = chalk.bgYellow(chalk.black(chalk.bold(diff)));
    }
    output += diff;
    output += ' | ' + outputInfo.branchName;

    return output;
  }
}

const repositories = argv.repositories;
const command = argv._[0];

const longestRepoNameLength = repositories.reduce(function(a, b) {
  return a.length > b.length ? a : b;
}).length;

let outputHeaders = chalk.bold(rightPadding('Repository', longestRepoNameLength));
if (command === 'pull') {
  outputHeaders +=
    ' | ' +
    chalk.bold('Insertions') +
    ' | ' +
    chalk.bold('Deletions') +
    ' | ' +
    chalk.bold('Master gap') +
    ' | ' +
    chalk.bold('Branch');
} else if (command === 'checkout') {
  outputHeaders += ' | ' + chalk.bold('Change');
} else if (command === 'upgrade') {
  outputHeaders += ' | ' + chalk.bold('Diff');
}

console.log(outputHeaders);

for (let repositoryPath of repositories) {
  repositoryPath = path.resolve(__dirname, '..', repositoryPath);
  const repo = new Repo(repositoryPath, longestRepoNameLength);
  const actions = {
    pull: () => {
      return repo.pull();
    },
    checkout: () => {
      const branchName = argv._[1];
      if (!branchName) {
        return new Promise((resolve, reject) => {
          return reject('You need to specify a branch to checkout');
        });
      }
      return repo.checkout(branchName);
    },
    upgrade: () => {
      return repo.upgrade();
    }
  };

  actions[command]()
    .then((result) => {
      console.log(result);
    })
    .catch((reason) => {
      console.error(chalk.red('Error while pulling "' + repositoryPath + '":\n'), reason);
    });
}

function rightPadding(string, paddingLength) {
  return (string + Array(paddingLength).join(' ')).substring(0, paddingLength);
}

function leftPadding(string, paddingLength) {
  return (Array(paddingLength).join(' ') + string).slice(-paddingLength);
}
