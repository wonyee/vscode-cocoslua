import * as vscode from 'vscode';
import { TextDocument, window, StatusBarAlignment, StatusBarItem } from 'vscode';
import { processDocument, SymbolInfoEx } from './luaSymbol';


const config = vscode.workspace.getConfiguration('lua');

export class LuaWorkspaceSymbolProvider
  implements vscode.WorkspaceSymbolProvider {

  static _statusBarItem: StatusBarItem;
  static symbols: Thenable<SymbolInfoEx[]>;
  static natives: any;
  static namespaces: any;
  public constructor(/*private languagemode: vscode.DocumentFilter*/) {
    this.provideWorkspaceSymbols();
    // load native symbols
    var jsonfile = require('jsonfile');
    var file = __dirname+'/native_symbols.json';
    LuaWorkspaceSymbolProvider._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
    LuaWorkspaceSymbolProvider.natives = jsonfile.readFileSync(file);
    LuaWorkspaceSymbolProvider.namespaces = [];
    if (LuaWorkspaceSymbolProvider.natives){
      let native = LuaWorkspaceSymbolProvider.natives['global'];
      if (native){
        for (let n in native){
          if (typeof(native[n]) === "object"){
            LuaWorkspaceSymbolProvider.namespaces.push(n);
          }
        }
      }
    }
  }

  public update(document: TextDocument) {
    LuaWorkspaceSymbolProvider.symbols.then(s => {
      let otherSymbols = s.filter(
        docSymbol => docSymbol.location.uri !== document.uri,
      );
      symbolsFromFile(document).then(symbolInfo => {
        let updated = otherSymbols.concat(symbolInfo);
        if (symbolInfo.length > 0) { // 如果有语法错误，导致解析出的symbolInfo为空。此时不更新LuaWorkspaceSymbolProvider.symbols
          LuaWorkspaceSymbolProvider.symbols = Promise.resolve(updated);
        }
      });
    });
  }
  dispose() {
    LuaWorkspaceSymbolProvider._statusBarItem.dispose();
  }
  provideWorkspaceSymbols = (
    //query: string,
    //token: vscode.CancellationToken,
  ): Thenable<SymbolInfoEx[]> => {
    let result = Promise.resolve(processWorkspace());
    LuaWorkspaceSymbolProvider.symbols = result;
    return result;
  }
}
function symbolsFromFile(document: any): Thenable<SymbolInfoEx[]> {
  let processed = processTextDocuments([document]).then(
    val => {
      let res = val[0] as SymbolInfoEx[];
      return res;
    },
    err => {
      return [] as SymbolInfoEx[];
    },
  );
  return processed;
}

function openTextDocuments(uris: vscode.Uri[]): Thenable<TextDocument[]> {
  return Promise.all(
    uris.map(uri => vscode.workspace.openTextDocument(uri).then(doc => doc)),
  );
}

function processTextDocuments(
  documents: TextDocument[],
): Thenable<SymbolInfoEx[][]> {
  return Promise.all(documents.map(document => processDocument(document)));
}

function processWorkspace(/*query: string*/): Thenable<SymbolInfoEx[]> {
  let maxFiles = config['maxWorkspaceFilesUsedBySymbols'];
  let excludePattern = config['workspaceFilesExcludePatternUsedBySymbols'];
  let docs = vscode.workspace
    .findFiles('**/*.lua', excludePattern, maxFiles)
    .then(
      workspaceFiles => {
        let openedTextDocuments = openTextDocuments(workspaceFiles);
        let processedTextDocuments = openedTextDocuments.then(
          results => {
            LuaWorkspaceSymbolProvider._statusBarItem.show();
            return processTextDocuments(results);
          },
          err => {
            return [];
          },
        );
        let symbolInformation = processedTextDocuments.then(
          symbols => {
            return [].concat.apply([], symbols) as SymbolInfoEx[];
          },
          err => {
            return [] as SymbolInfoEx[];
          },
        );
        return symbolInformation;
      },
      fileError => {
        return [];
      },
    );
  return <any>docs;
}
