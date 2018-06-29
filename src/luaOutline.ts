import {
    Event,
    EventEmitter,
    ExtensionContext,
    Range,
    Selection,
    SymbolKind,
    TextDocument,
    TextEditor,
    TextEditorRevealType,
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
    TreeView,
    commands,
    window,
    workspace,
    Position
} from "vscode";
import { SymbolInfoEx } from './luaSymbol';
import { getIcon } from './icons';


export class SymbolNode {
    parent?: SymbolNode;
    symbol: SymbolInfoEx;
    children: SymbolNode[];

    constructor(symbol?: SymbolInfoEx) {
        this.children = [];
        if (symbol) {
            this.symbol = symbol;
        }
        else {
            this.symbol = new SymbolInfoEx('', SymbolKind.Method, new Range(new Position(0, 0), new Position(0, 0)));
        }

    }

    public static shouldAutoExpand(kind: SymbolKind): boolean {
        return kind === SymbolKind.Class;
    }

    addChild(child: SymbolNode) {
        child.parent = this;
        this.children.push(child);
    }
}

export class SymbolOutlineTreeDataProvider
    implements TreeDataProvider<SymbolNode> {
    private _onDidChangeTreeData: EventEmitter<SymbolNode | null> = new EventEmitter<SymbolNode | null>();
    readonly onDidChangeTreeData: Event<SymbolNode | null> = this
        ._onDidChangeTreeData.event;

    private context: ExtensionContext;
    private tree: SymbolNode | undefined;
    private editor: TextEditor | undefined;

    constructor(context: ExtensionContext) {
        this.context = context;
    }

    private getSymbols(document: TextDocument): Thenable<SymbolInfoEx[] | undefined> {
        return commands.executeCommand<SymbolInfoEx[]>(
            "vscode.executeDocumentSymbolProvider",
            document.uri
        );
    }

    private async updateSymbols(editor: TextEditor | undefined): Promise<void> {
        if (!editor) {
            return;
        }
        this.editor = editor;
        if (editor) {
            const tree = new SymbolNode();
            let symbols = await this.getSymbols(editor.document);
            if (!symbols || symbols.length === 0) {
                return;
            }
            // Create symbol nodes
            const symbolNodes = symbols.map(symbol => new SymbolNode(symbol));
            // Start with an empty list of parent candidates
            let potentialParents: SymbolNode[] = [];
            symbolNodes.forEach(currentNode => {
                // Drop candidates that do not contain the current symbol range
                let pp = potentialParents
                    .filter(
                        node =>
                            node !== currentNode &&
                            ((
                                currentNode.symbol.kind === SymbolKind.Method &&
                                node.symbol.kind === SymbolKind.Class &&
                                currentNode.symbol.containerName === node.symbol.name
                            ) ||
                            (
                                currentNode.symbol.kind !== SymbolKind.Method &&
                                currentNode.symbol.containerName === node.symbol.name
                            ))
                    );
                // See if any candidates remain
                if ((currentNode.symbol.kind === SymbolKind.Method ||
                    currentNode.symbol.kind === SymbolKind.Function ||
                    currentNode.symbol.kind === SymbolKind.Class) &&
                    !currentNode.symbol.name.startsWith('@')) {
                    if (!pp.length) {
                        tree.addChild(currentNode);
                    } else {
                        const parent = pp[pp.length - 1];
                        parent.addChild(currentNode);
                    }
                    // Add current node as a parent candidate
                    potentialParents.push(currentNode);
                }
            });
            this.tree = tree;
        }
    }

    async getChildren(node?: SymbolNode): Promise<SymbolNode[]> {
        if (node) {
            return node.children;
        } else {
            await this.updateSymbols(window.activeTextEditor);
            return this.tree ? this.tree.children : [];
        }
    }

    getParent(node: SymbolNode): SymbolNode {
        if (node.parent) {
            return node.parent;
        }
        else {
            return new SymbolNode();
        }
    }

    getNodeByPosition(position: Position): SymbolNode {
        if (this.tree) {
            let node = this.tree;
            while (node.children.length) {
                const matching = node.children.filter(node =>
                    node.symbol.location.range.contains(position)
                );
                if (!matching.length) {
                    break;
                }
                node = matching[0];
            }
            if (node.symbol) {
                return node;
            }
        }
        return new SymbolNode();
    }

    getTreeItem(node: SymbolNode): TreeItem {
        const { kind } = node.symbol;
        let treeItem = new TreeItem(node.symbol.name);

        if (node.children.length) {
            treeItem.collapsibleState =
                SymbolNode.shouldAutoExpand(kind)
                    ? TreeItemCollapsibleState.Expanded
                    : TreeItemCollapsibleState.Collapsed;
        } else {
            treeItem.collapsibleState = TreeItemCollapsibleState.None;
        }

        treeItem.command = {
            command: "symbolOutline.revealRange",
            title: "",
            arguments: [this.editor, node.symbol.location.range]
        };

        treeItem.iconPath = getIcon(kind, this.context);
        return treeItem;
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }
}

export class LuaSymbolOutlineProvider {
    symbolViewer: TreeView<SymbolNode>;

    constructor(context: ExtensionContext) {
        const treeDataProvider = new SymbolOutlineTreeDataProvider(context);
        this.symbolViewer = window.createTreeView("symbolOutline", {
            treeDataProvider
        });
        commands.registerCommand("symbolOutline.refresh", () => {
            treeDataProvider.refresh();
        });
        commands.registerCommand(
            "symbolOutline.revealRange",
            (editor: TextEditor, range: Range) => {
                editor.revealRange(range, TextEditorRevealType.Default);
                editor.selection = new Selection(range.start, range.start);
                commands.executeCommand("workbench.action.focusActiveEditorGroup");
            }
        );
        window.onDidChangeActiveTextEditor(editor => treeDataProvider.refresh());
        workspace.onDidCloseTextDocument(document => treeDataProvider.refresh());
        workspace.onDidChangeTextDocument(event => treeDataProvider.refresh());
        workspace.onDidSaveTextDocument(document => treeDataProvider.refresh());
        commands.registerTextEditorCommand(
            "symbolOutline.revealCurrentSymbol",
            (editor: TextEditor) => {
                if (editor.selections.length) {
                    const node = treeDataProvider.getNodeByPosition(
                        editor.selections[0].active
                    );
                    if (node) {
                        this.symbolViewer.reveal(node);
                    }
                }
            }
        );
    }
}
