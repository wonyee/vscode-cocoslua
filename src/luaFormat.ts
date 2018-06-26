import * as vscode from 'vscode';
import { formatText, UserOptions, WriteMode } from 'lua-fmt';
let utf8 = require('utf8');
export const opt: UserOptions = {
    sourceText: '',
    lineWidth: 180,
    indentCount: 4,
    useTabs: false,
    linebreakMultipleAssignments: false,
    quotemark: 'single',
    writeMode: WriteMode.StdOut
};
export class LuaDocumentFormatter implements vscode.DocumentFormattingEditProvider {
    public provideDocumentFormattingEdits(document: vscode.TextDocument):
        Thenable<vscode.TextEdit[]> {
        return new Promise((resolve, reject) => {
            let text = document.getText();
            text = text.replace(/([^-])--([^-\[])/g,'$1 --$2'); // avoid var,--comments => var,\n--comments
            let endPos = document.positionAt(text.length);
            text = utf8.encode(text);
            let formattedText = formatText(text, opt);
            return resolve([vscode.TextEdit.replace(new vscode.Range(0, 0, endPos.line, endPos.character),
                utf8.decode(formattedText))]);
        });
    }
}
export class LuaDocumentRangeFormatter implements vscode.DocumentRangeFormattingEditProvider {
    public provideDocumentRangeFormattingEdits(document: vscode.TextDocument, range: vscode.Range):
        Thenable<vscode.TextEdit[]> {
        return new Promise((resolve, reject) => {
            let text = document.getText(range);
            text = text.replace(/([^-])--([^-\[])/g,'$1 --$2'); // avoid var,--comments => var,\n--comments
            text = utf8.encode(text);
            
            let formattedText = formatText(text, opt);
            return resolve([vscode.TextEdit.replace(range,
                utf8.decode(formattedText))]);
        });
    }
}