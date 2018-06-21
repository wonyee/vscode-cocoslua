import * as vscode from 'vscode';
import {LuaWorkspaceSymbolProvider} from './luaWorkspaceSymbols';
import { SymbolInfoEx } from './luaSymbol';

export class LuaDefinitionProvider implements vscode.DefinitionProvider {
    public provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken):
        Thenable<vscode.Location> {
            return new Promise<vscode.Location>((resolve, reject) => {
                let wordRange = document.getWordRangeAtPosition(position);
                let word = document.getText(wordRange);
                let largerRange = document.getWordRangeAtPosition(position, /[a-zA-Z0-9_\.:\'\"]+/);
                let larger = document.getText(largerRange);
                let pre_container = "";
                let valid = true;
                let splitarr = larger.split('.');
                if (splitarr.length > 2) {
                    if (word !== splitarr[0] && word !== splitarr[1]) {
                        valid = false;
                    }
                    else if (word === splitarr[1]) {
                        pre_container = splitarr[0];
                    }
                }
                else if (larger.indexOf('\'') !== -1){
                    valid = false;
                }
                else if (larger.indexOf('\"') !== -1){
                    valid = false;
                }
                if (word.length > 1 && valid) {
                    LuaWorkspaceSymbolProvider.symbols.then(items => {
                        let bestmatch:SymbolInfoEx | undefined;
                        let bestscore = 0;

                        let container: string[] = [''];
                        let min_gap = 10000;
                        let class_symbol: SymbolInfoEx | undefined;
                        let found_same_uri = false;
                        /////// 找出包含链
                        if (pre_container === "") {
                            items.forEach(itm_check => {
                                if (itm_check.location.uri.path === document.uri.path) {
                                  found_same_uri = true;
                                  if (word === "self"){
                                      if (itm_check.kind === vscode.SymbolKind.Class) {
                                          class_symbol = itm_check;
                                          return;
                                      }
                                  }
                                  else if (itm_check.kind === vscode.SymbolKind.Method || itm_check.kind === vscode.SymbolKind.Function){
                                    if (position.line >= itm_check.location.range.start.line && position.line <= itm_check.location.range.end.line) {
                                      if (position.line - itm_check.location.range.start.line < min_gap){
                                        min_gap = position.line - itm_check.location.range.start.line;
                                        container.push(itm_check.name);
                                      }
                                    }
                                  }
                                }
                              });
                            }
                        else {
                            container.push(pre_container);
                        }
                        if (word === "self" && class_symbol) {
                            return resolve(class_symbol.location);
                        }

                        if (!found_same_uri) {
                            console.log("not found same uri!! "+document.uri.fsPath);
                        }
                        
                        items.forEach(item => {
                            if (item.name === word) {
                                let score = 10;
                                if (item.location.uri.path === document.uri.path) {
                                    score += 100;// 相同文件，加100分
                                    if (container.length > 0) {
                                        for (let p=0; p<container.length; p++) {
                                            if (item.containerName === container[p]) {
                                                score += 50; // match
                                                let gap = container.length - p;
                                                score -= gap;
                                                break;
                                            }
                                        }
                                    }
                                }
                                // 比较分数
                                if (score > bestscore) {
                                    bestmatch = item;
                                    bestscore = score;
                                }
                            }
                        });
                        if (bestscore > 0 && bestmatch !== undefined){
                            return resolve(bestmatch.location);
                        }
                        else {
                            return resolve(undefined);
                        }
                    });
                }
                else{
                    return resolve(undefined);
                }
            });
    }
}
