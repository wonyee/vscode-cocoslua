import * as vscode from 'vscode';
import { LuaWorkspaceSymbolProvider } from './luaWorkspaceSymbols';


let sugg_set: Set<string>;
let sugg_word_set: Set<string>;

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
        //console.log("typed = "+typed);
        let sugg = new vscode.CompletionItem(i);
        sugg.kind = vscode.CompletionItemKind.Class;
        if (o[i].type === 'method') {
          sugg.kind = vscode.CompletionItemKind.Interface;
          if (o[i].detail) {
            sugg.detail = o[i].detail;
          }
          if (o[i].ret) {
            sugg.detail += "\nret: " + o[i].ret;
          }
          if (o[i].define) {
            sugg.insertText = new vscode.SnippetString(o[i].define);
          }
        }
        sugg.sortText = 'i'; // native
        if (!sugg_word_set.has(i)) {
          sugg_word_set.add(i);
        }
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
        if (o[i].ret) {
          sugg.detail += "\nret: " + o[i].ret;
        }
        if (o[i].define) {
          sugg.insertText = new vscode.SnippetString(o[i].define);
        }
        sugg.sortText = 'i'; // native
        if (!sugg_word_set.has(o[i])) {
          sugg_word_set.add(o[i]);
        }
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

export function getType(arr: Array<string>) {
  if (arr.length === 1) {
    if (LuaWorkspaceSymbolProvider.namespaces.includes(arr[0])) {
      return arr[0];
    }
    return "";
  }
  //  let ret :Array<string> = [];
  let idx = 0;
  let sym = LuaWorkspaceSymbolProvider.natives["global"];
  while (true) {
    if (idx > arr.length - 1) {
      return arr[arr.length - 1];
    }
    let key = arr[idx];
    if (sym[key]) {
      sym = sym[key];
      if (sym.type === "method") {
        let ret = sym.ret;
        //console.log("found method: "+sym.define+" ret:"+sym.ret);
        if (idx === arr.length - 1) {
          let a = ret.split('.');
          return a[a.length - 1];
        }
        let ret_split = ret.split('.');
        if (ret_split.length === 2 && idx > 0) {
          arr[idx] = ret_split[1];
          arr[idx - 1] = ret_split[0];
          sym = LuaWorkspaceSymbolProvider.natives["global"];
          idx--;
          continue;
        }
      }
      idx++;
    }
    else {
      return "";
    }
  }
  return "";
}

function CheckType(doc: vscode.TextDocument, pos: vscode.Position) {
  // let line = doc.lineAt(pos);
  // let code = line.text.charCodeAt(pos.character-2); // .或者:前面那个字符
  // if ((code > 47 && code < 58) || // numeric (0-9)
  //     (code > 64 && code < 91) || // upper alpha (A-Z)
  //     (code > 96 && code < 123) || // lower alpha (a-z)
  //     (code === 95)) { // underscore

  // }
  let curr_pos = pos.character - 1;
  let line = doc.lineAt(pos).text;
  let failed = false;
  let arr: Array<string> = [];
  while (true) {
    let left = new vscode.Position(pos.line, curr_pos);
    let left_range = doc.getWordRangeAtPosition(left, new RegExp('[\(,=\s]+')); // 如果遇到( , =则可以停止了
    let stop_char = "";
    if (left_range) {
      stop_char = doc.getText(left_range);
    }
    if (stop_char === "" || stop_char.trim() === "") { // 没有满足停止条件，继续
      left_range = doc.getWordRangeAtPosition(left, new RegExp('[)\s]+'));
      let close_params = "";
      if (left_range) {
        close_params = doc.getText(left_range);
      }
      if (close_params === "" || close_params.trim() === "") { // 不是函数参数列表，继续
        left_range = doc.getWordRangeAtPosition(left, new RegExp('[a-zA-Z0-9_\s]+'));
        let word = "";
        if (left_range) {
          word = doc.getText(left_range);
          //console.log("word:" + word);
          arr.push(word);
          curr_pos = left_range.start.character - 1;
          if (curr_pos < 0) {
            break;
          }
        }
        else {
          break;
        }
      }
      else if (left_range) {
        // 往左边一直追溯到匹配的那个(
        //console.log("search for matching bracket");
        let cur = left_range.start.character - 1;
        let match_count = 0;
        while (cur > 0) {
          let code = line.charCodeAt(cur);
          if (code === 41) { // ')'
            match_count--;
          }
          else if (code === 40) {
            match_count++;
          }
          if (match_count > 0) { // found!
            curr_pos = cur - 1;
            break;
          }
          cur = cur - 1;
        }
      }
      else {
        failed = true;
        break;
      }
    }
    else {
      //console.log("stop!");
      break;
    }
  }
  if (failed) {
    //console.log("FAILED");
  }
  else {
    // console.log("---------------------\nstack: ");
    // for (let a of arr) {
    //   console.log(a);
    // }
    if (arr.length === 1 && arr[0] === "self") {
      return "self";
    }
    arr.reverse();
    let retArr = getType(arr);
    return retArr;
  }
  return "";
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

      sugg_set = new Set();
      sugg_word_set = new Set();
      let already_suggested = false;
      let class_methods = false;
      let class_members = false;
      let posleft = new vscode.Position(position.line, position.character - 1);
      let txt = "";
      let typed = "";
      if (posleft) {
        txt = document.getText(new vscode.Range(posleft, position));
        if (txt !== '.' && txt !== ':') {
          let wordRange = document.getWordRangeAtPosition(position, new RegExp('([a-zA-Z_][a-zA-Z0-9_]+)|([a-zA-Z_])'));
          if (wordRange) {
            typed = document.getText(wordRange).toLowerCase();
          }
        }
      }
      let line = document.lineAt(position);
      let trytxt = line.text.trim();
      //////////////特定关键词，给出后续关键词提示
      if (trytxt.startsWith('if') || trytxt.startsWith('elseif')) {
        let sugg = new vscode.CompletionItem('then');
        sugg.kind = vscode.CompletionItemKind.Keyword;
        sugg.sortText = 'a'; // keyword
        suggestions.push(sugg);
      }
      else if (trytxt.startsWith('for')) {
        let sugg = new vscode.CompletionItem('do');
        sugg.kind = vscode.CompletionItemKind.Keyword;
        sugg.sortText = 'a'; // keyword
        suggestions.push(sugg);
        sugg = new vscode.CompletionItem('pairs');
        sugg.kind = vscode.CompletionItemKind.Keyword;
        sugg.sortText = 'a'; // keyword
        suggestions.push(sugg);
        sugg = new vscode.CompletionItem('ipairs');
        sugg.kind = vscode.CompletionItemKind.Keyword;
        sugg.sortText = 'a'; // keyword
        suggestions.push(sugg);
      }
      else if (trytxt.startsWith('while')) {
        let sugg = new vscode.CompletionItem('do');
        sugg.kind = vscode.CompletionItemKind.Keyword;
        sugg.sortText = 'a'; // keyword
        suggestions.push(sugg);
      }

      if ((txt === '.' || txt === ':') && position.character > 1) {
        //////////class,self相关
        let posleft2 = new vscode.Position(position.line, position.character - 2);
        let wordRange = document.getWordRangeAtPosition(posleft2, new RegExp('[a-zA-Z0-9_\(\)]+'));
        let prefix = document.getText(wordRange);
        // if ((prefix === 'getInstance()' || prefix === 'new()') && wordRange) { // 如果是getInstance()，那么往前找类型来进行匹配！
        //   posleft2 = new vscode.Position(position.line, wordRange.start.character - 2);
        //   wordRange = document.getWordRangeAtPosition(posleft2, new RegExp('[a-zA-Z0-9_\(\)]+'));
        //   prefix = document.getText(wordRange);
        // }
        let checkType = CheckType(document, position);
        if (checkType !== "") {
          prefix = checkType;
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
          already_suggested = true;
          //////////native提示
          traverse(<JSON>LuaWorkspaceSymbolProvider.natives, '', suggestions, prefix);
          if (suggestions.length === 0) { // 没找到
            if (txt === '.') { // 如果是. 那么可能是table的内容？ 根据prefix搜搜看
              LuaWorkspaceSymbolProvider.symbols.then(items => {
                items.forEach(item => {
                  if (item.containerName === prefix) {
                    let inscope = false;
                    let samefile = item.location.uri === document.uri;
                    if (!samefile) { // 需要判断所属的table是否是全局变量
                      for (let checkagain of items) {
                        if (item.location.uri === checkagain.location.uri &&
                            item.containerName === checkagain.name) {
                          if (checkagain.containerName === 'global') {
                            inscope = true;
                            break;
                          }
                        }
                      }
                    }
                    else {
                      inscope = true;
                    }
                    if (inscope) {
                      let sugg = new vscode.CompletionItem(item.name);
                      sugg.kind = vscode.CompletionItemKind.Variable;
                      if (item.location.uri === document.uri) { //同文件
                        sugg.sortText = 'b'; // current file
                      }
                      else {
                        sugg.sortText = 'u'; // other file
                      }
                      let keystr = item.name + item.containerName;
                      if (!sugg_set.has(keystr)) {
                        sugg_set.add(keystr);
                        suggestions.push(sugg);
                      }
                      if (!sugg_word_set.has(item.name)) {
                        sugg_word_set.add(item.name);
                      }
                    }
                  }
                });
              });
            }
            else if (txt === ':') { // 会不会是已知类型的变量？
              let is_var = false;
              let var_type = "";
              LuaWorkspaceSymbolProvider.symbols.then(items => {
                items.forEach(item => {
                  if (item.location.uri === document.uri) {
                    if (item.name === prefix) {
                      is_var = true;
                      var_type = item.type;
                    }
                  }
                });
                if (is_var && var_type !== "") {
                  traverse(<JSON>LuaWorkspaceSymbolProvider.natives, '', suggestions, var_type);
                }
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
                if (!sugg_set.has(keystr)) {
                  sugg_set.add(keystr);
                  suggestions.push(sugg);
                }
                if (!sugg_word_set.has(item.name)) {
                  sugg_word_set.add(item.name);
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
                if (!sugg_set.has(keystr)) {
                  sugg_set.add(keystr);
                  suggestions.push(sugg);
                }
                if (!sugg_word_set.has(item.name)) {
                  sugg_word_set.add(item.name);
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
                      if (!sugg_set.has(keystr)) {
                        sugg_set.add(keystr);
                        suggestions.push(sugg);
                      }
                      if (!sugg_word_set.has(item.name)) {
                        sugg_word_set.add(item.name);
                      }
                    }
                    else if (item.containerName === '') { // local 只放前面的
                      if (item.location.range.start.line <= position.line) {
                        sugg.sortText = 'e'; // 'local' current file
                        let keystr = item.name + item.containerName;
                        if (!sugg_set.has(keystr)) {
                          sugg_set.add(keystr);
                          suggestions.push(sugg);
                        }
                        if (!sugg_word_set.has(item.name)) {
                          sugg_word_set.add(item.name);
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
                      if (!sugg_set.has(keystr)) {
                        sugg_set.add(keystr);
                        suggestions.push(sugg);
                      }
                      if (!sugg_word_set.has(item.name)) {
                        sugg_word_set.add(item.name);
                      }
                    }
                  }
                }
                else { // 还是当前文件
                  // variables
                  if (item.containerName === 'global' && item.location.range.start.line <= position.line) {
                    sugg.sortText = 'g'; // global in current file
                    let keystr = item.name + item.containerName;
                    if (!sugg_set.has(keystr)) {
                      sugg_set.add(keystr);
                      suggestions.push(sugg);
                    }
                    if (!sugg_word_set.has(item.name)) {
                      sugg_word_set.add(item.name);
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
                    if (!sugg_set.has(keystr)) {
                      sugg_set.add(keystr);
                      suggestions.push(sugg);
                    }
                    if (!sugg_word_set.has(item.name)) {
                      sugg_word_set.add(item.name);
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
                if (!sugg_set.has(keystr)) {
                  sugg_set.add(keystr);
                  suggestions.push(sugg);
                }
                if (!sugg_word_set.has(item.name)) {
                  sugg_word_set.add(item.name);
                }
              }
            });
            { // word suggestions
              if (typed !== "") {
                let keywords = ["return", "repeat", "until", "table", "break", "goto", "true", "false", "while"];
                for (let k of keywords) {
                  if (k.startsWith(typed)) {
                    let sugg = new vscode.CompletionItem(k);
                    sugg.kind = vscode.CompletionItemKind.Keyword;
                    sugg.sortText = 'a';
                    suggestions.push(sugg);
                  }
                }
                
                let text = document.getText();
                let match = text.match(new RegExp(/([a-zA-Z_][a-zA-Z0-9_][a-zA-Z0-9_]+)/g)); // 至少三个
                if (match) {
                  for (let m of match) {
                    let lm = m.toLowerCase();
                    if (lm.startsWith(typed) && lm !== typed) {
                      if (!sugg_word_set.has(m)) {
                        sugg_word_set.add(m);
                        let sugg = new vscode.CompletionItem(m);
                        sugg.kind = vscode.CompletionItemKind.Text;
                        sugg.sortText = 'z';
                        suggestions.push(sugg);
                      }
                    }
                  }
                }
              }
            }
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
