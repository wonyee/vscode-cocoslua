import * as vscode from 'vscode';
import { LuaWorkspaceSymbolProvider } from './luaWorkspaceSymbols';

// sortText:
// a: keyword
// b: class method (current file)
// c: local in scope
// e: local
// g: global in current file
// i: native
// u: global in other file
function traverse(o: any, parent: string, v: vscode.CompletionItem[], match: string) {
  for (var i in o) {
    //func.apply(this,[i,o[i]]);
    if (o[i] !== null && typeof (o[i]) === "object") {
      //going one step down in the object tree!!
      if (parent === match) {
        let sugg = new vscode.CompletionItem(i);
        sugg.kind = vscode.CompletionItemKind.Class;
        if (o[i].type === 'method') {
          sugg.kind = vscode.CompletionItemKind.Interface;
          if (o[i].detail) {
            sugg.detail = o[i].detail;
          }
          if (o[i].define) {
            sugg.insertText = new vscode.SnippetString(o[i].define);
          }
        }
        sugg.sortText = 'i'; // native
        v.push(sugg);
      }
      traverse(o[i], i, v, match);
    }
    else if (o[i] !== null) {
      if (parent === match) {
        let sugg = new vscode.CompletionItem(o[i]);
        sugg.kind = vscode.CompletionItemKind.Function;
        if (o[i].detail) {
          sugg.detail = o[i].detail;
        }
        if (o[i].define) {
          sugg.insertText = new vscode.SnippetString(o[i].define);
        }
        sugg.sortText = 'i'; // native
        v.push(sugg);
      }
    }
  }
}
function in_array(searchString: string, array: string[]) {
  for (let i = 0; i < array.length; i++) {
    if (searchString === array[i]) {
      return true;
    }
  }
  return false;
}
export class LuaCompletionProvider implements vscode.CompletionItemProvider {
  public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position,
    token: vscode.CancellationToken, ): Thenable<vscode.CompletionItem[]> {
    return new Promise<vscode.CompletionItem[]>((resolve, reject) => {
      if (position.character < 1) {
        return [];
      }
      let suggestions: vscode.CompletionItem[];
      suggestions = [];

      let sugg_set: Set<string> = new Set();
      let already_suggested = false;
      let class_methods = false;
      let class_members = false;
      let posleft = new vscode.Position(position.line, position.character - 1);
      let txt = document.getText(new vscode.Range(posleft, position));
      let line = document.lineAt(position);
      line.text.trim();
      //////////////特定关键词，给出后续关键词提示
      if (line.text.startsWith('if') || line.text.startsWith('elseif')) {
        let sugg = new vscode.CompletionItem('then');
        sugg.kind = vscode.CompletionItemKind.Keyword;
        sugg.sortText = 'a'; // keyword
        suggestions.push(sugg);
      }

      if ((txt === '.' || txt === ':') && position.character > 1) {
        //////////class,self相关
        let posleft2 = new vscode.Position(position.line, position.character - 2);
        let wordRange = document.getWordRangeAtPosition(posleft2, new RegExp('[a-zA-Z0-9_\(\)]+'));
        let prefix = document.getText(wordRange);
        if ((prefix === 'getInstance()' || prefix === 'new()') && wordRange) { // 如果是getInstance()，那么往前找类型来进行匹配！
          posleft2 = new vscode.Position(position.line, wordRange.start.character - 2);
          wordRange = document.getWordRangeAtPosition(posleft2, new RegExp('[a-zA-Z0-9_\(\)]+'));
          prefix = document.getText(wordRange);
        }
        if (prefix === 'self') { // 如果是self，不需要从native里面找
          if (txt === '.') {
            class_members = true;
          }
          else {
            class_methods = true;
          }
        }
        else {
          // .或者: 尝试根据prefix找native的匹配
          already_suggested = true;
          //////////native提示
          traverse(<JSON>LuaWorkspaceSymbolProvider.natives, '', suggestions, prefix);
          if (suggestions.length === 0) { // 没找到
            if (txt === '.') { // 如果是. 那么可能是table的内容？ 根据prefix搜搜看
              LuaWorkspaceSymbolProvider.symbols.then(items => {
                items.forEach(item => {
                  if (item.containerName === prefix){
                    let sugg = new vscode.CompletionItem(item.name);
                    sugg.kind = vscode.CompletionItemKind.Variable;
                    if (item.location.uri === document.uri) { //同文件
                      sugg.sortText = 'b'; // current file
                    }
                    else {
                      sugg.sortText = 'u'; // other file
                    }
                    let keystr = item.name + item.containerName;
                    if (!sugg_set.has(keystr)){
                      sugg_set.add(keystr);
                      suggestions.push(sugg);
                    }
                  }
                });
              });
            }
          }
        }
      }
      else {
        //////////native提示
        traverse(<JSON>LuaWorkspaceSymbolProvider.natives, '', suggestions, 'global');
        already_suggested = false;
      }

      if (!already_suggested) {
        if (class_methods) {
          // class相关提示
          LuaWorkspaceSymbolProvider.symbols.then(items => {
            items.forEach(item => {
              if (item.location.uri === document.uri &&
                item.kind === vscode.SymbolKind.Method) {
                let sugg = new vscode.CompletionItem(item.name);
                sugg.kind = vscode.CompletionItemKind.Interface;
                if (item.detail !== "") {
                  sugg.insertText = new vscode.SnippetString(item.detail);
                }
                sugg.sortText = 'b'; // class method current file
                let keystr = item.name + item.containerName;
                if (!sugg_set.has(keystr)){
                  sugg_set.add(keystr);
                  suggestions.push(sugg);
                }
              }
            });
            if (suggestions.length > 0) {
              resolve(suggestions);
            }
            else {
              reject();
            }
          });
        }
        else if (class_members) {
          // class相关提示
          LuaWorkspaceSymbolProvider.symbols.then(items => {
            items.forEach(item => {
              if (item.location.uri === document.uri &&
                item.containerName === 'self') {
                let sugg = new vscode.CompletionItem(item.name);
                sugg.kind = vscode.CompletionItemKind.Variable;
                if (item.detail !== "") {
                  sugg.insertText = new vscode.SnippetString(item.detail);
                }
                sugg.sortText = 'b'; // class method current file
                let keystr = item.name + item.containerName;
                if (!sugg_set.has(keystr)){
                  sugg_set.add(keystr);
                  suggestions.push(sugg);
                }
              }
            });
            if (suggestions.length > 0) {
              resolve(suggestions);
            }
            else {
              reject();
            }
          });
        }
        else {
          ///////////////////遍历symbol给出提示
          LuaWorkspaceSymbolProvider.symbols.then(items => {
            let container: string[] = [''];
            let min_gap = 10000;
            /////// 找出包含链
            items.forEach(item => {
              if (item.location.uri === document.uri) {
                if (item.kind === vscode.SymbolKind.Method || item.kind === vscode.SymbolKind.Function) {
                  if (position.line >= item.location.range.start.line && position.line <= item.location.range.end.line) {
                    if (position.line - item.location.range.start.line < min_gap) {
                      min_gap = position.line - item.location.range.start.line;
                      container.push(item.name);
                    }
                  }
                }
              }
            });
            items.forEach(item => {
              if (item.location.uri === document.uri) {
                ///////// 根据包含链给出上下文相关提示
                /////////////先在本文件查找
                let sugg = new vscode.CompletionItem(item.name);
                sugg.kind = vscode.CompletionItemKind.Variable; // default
                switch (item.kind) {
                  case vscode.SymbolKind.Class:
                    sugg.kind = vscode.CompletionItemKind.Class;
                    break;
                  case vscode.SymbolKind.Method:
                    sugg.kind = vscode.CompletionItemKind.Interface;
                    if (item.detail !== "") {
                      sugg.insertText = new vscode.SnippetString(item.detail);
                    }
                    break;
                  case vscode.SymbolKind.Function:
                    sugg.kind = vscode.CompletionItemKind.Function;
                    if (item.detail !== "") {
                      sugg.insertText = new vscode.SnippetString(item.detail);
                    }
                    break;
                }
                if (sugg.kind === vscode.CompletionItemKind.Interface || sugg.kind === vscode.CompletionItemKind.Function) {
                  // function
                  if (container[container.length - 1] === '') { // 最外层
                    if (item.containerName === 'global') { // 全局都放
                      sugg.sortText = 'g'; // global current file
                      let keystr = item.name + item.containerName;
                      if (!sugg_set.has(keystr)){
                        sugg_set.add(keystr);
                        suggestions.push(sugg);
                      }
                    }
                    else if (item.containerName === '') { // local 只放前面的
                      if (item.location.range.start.line <= position.line) {
                        sugg.sortText = 'e'; // 'local' current file
                        let keystr = item.name + item.containerName;
                        if (!sugg_set.has(keystr)){
                          sugg_set.add(keystr);
                          suggestions.push(sugg);
                        }
                      }
                    }
                  }
                  else if (in_array(item.containerName, container) ||
                    item.containerName === '' ||
                    item.containerName === 'global') {
                    if (item.containerName === 'global' || item.location.range.start.line <= position.line) { // 判定位置在前面的
                      if (item.containerName === 'global') {
                        sugg.sortText = 'g'; // global current file
                      }
                      else if (item.containerName === '') {
                        sugg.sortText = 'e'; // 'local'
                      }
                      else {
                        sugg.sortText = 'c'; // in scope
                      }
                      let keystr = item.name + item.containerName;
                      if (!sugg_set.has(keystr)){
                        sugg_set.add(keystr);
                        suggestions.push(sugg);
                      }
                    }
                  }
                }
                else { // 还是当前文件
                  // variables
                  if (item.containerName === 'global' && item.location.range.start.line <= position.line) {
                    sugg.sortText = 'g'; // global in current file
                    let keystr = item.name + item.containerName;
                    if (!sugg_set.has(keystr)){
                      sugg_set.add(keystr);
                      suggestions.push(sugg);
                    }
                  }
                  else if ((container[container.length - 1] === item.containerName ||
                    in_array(item.containerName, container) || item.containerName === '')
                    && item.location.range.start.line <= position.line) {
                    if (item.containerName === '') {
                      sugg.sortText = 'e'; // 'local'
                    }
                    else {
                      sugg.sortText = 'c'; // in scope
                    }
                    let keystr = item.name + item.containerName;
                    if (!sugg_set.has(keystr)){
                      sugg_set.add(keystr);
                      suggestions.push(sugg);
                    }
                  }
                }
              }
              else if (item.containerName && item.containerName === 'global') { // only suggest globals
                ///////////// 跨文件的全局变量、全局函数给出提示
                let sugg = new vscode.CompletionItem(item.name);
                sugg.kind = vscode.CompletionItemKind.Variable; // default
                switch (item.kind) {
                  case vscode.SymbolKind.Class:
                    sugg.kind = vscode.CompletionItemKind.Class;
                    break;
                  case vscode.SymbolKind.Method:
                    if (item.detail !== "") {
                      sugg.insertText = new vscode.SnippetString(item.detail);
                    }
                    sugg.kind = vscode.CompletionItemKind.Interface;
                    break;
                  case vscode.SymbolKind.Function:
                    if (item.detail !== "") {
                      sugg.insertText = new vscode.SnippetString(item.detail);
                    }
                    sugg.kind = vscode.CompletionItemKind.Function;
                    break;
                }
                if (vscode.workspace.rootPath) {
                  sugg.documentation = item.location.uri.fsPath.substr(vscode.workspace.rootPath.length + 1);
                }
                else {
                  sugg.documentation = item.location.uri.fsPath;
                }
                sugg.sortText = 'u'; // other file
                let keystr = item.name + item.containerName;
                if (!sugg_set.has(keystr)){
                  sugg_set.add(keystr);
                  suggestions.push(sugg);
                }
              }
            });
            if (suggestions.length > 0) {
              resolve(suggestions);
            }
            else {
              reject();
            }
          });
        } // not class
      }

      resolve(suggestions);
    });
  }
}
