#!/usr/bin/env node
const simpleGit = require('simple-git');
const path = require('path');

const argv = require('yargs')
  .usage('Usage: $0 <action> <branch>')
  .command('action', 'Action to run: pull, checkout')
  .command('branch', 'Branch to use')
  .option('repositories', {
    alias    : 'r',
    describe : 'Repositories to work on separated by a space',
    type     : 'array'
  })
  .demandCommand(0, 'Please choose an action to run')
  .demandOption(['repositories'], 'Please provide the repositories to work on')
  .example('$0 pull', 'Pull from the tracking remote')
  .example('$0 checkout <branch>', 'Checkout the given branch').argv;

class Repo {
  constructor(path) {
    this.repository = simpleGit(path);
    this.repository._silentLogging = true;
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
          return resolve(this.repository._baseDir + ' - ' + status.tracking + ' branch pulled:\n' + JSON.stringify(result, null, 2));
        });
      });
    });
  }

  checkout(branch) {
    return new Promise((resolve, reject) => {
      this.repository.status((err, status) => {
        if (err) {
          return reject(err);
        }
        this.repository.checkout(branch, (err) => {
          if (err) {
            return reject(err);
          }
          return resolve(this.repository._baseDir + ' - Branch "' + branch + '" checked out from "' + status.current + '"');
        });
      });
    });
  }
}

for (let repositoryPath of argv.repositories) {
  repositoryPath = path.resolve(__dirname, '..', repositoryPath);
  const repo = new Repo(repositoryPath);
  const actions = {
    pull     : () => {
      return repo.pull();
    },
    checkout : () => {
      if (!argv._[1]) {
        return new Promise((resolve, reject) => {
          return reject('You need to specify a branch to checkout');
        });
      }
      return repo.checkout(argv._[1]);
    }
  };

  actions
    [argv._[0]]()
    .then((result) => {
      console.log(result);
    })
    .catch((reason) => {
      console.error('Error while pulling "' + repositoryPath + '":\n', reason);
    });
}
