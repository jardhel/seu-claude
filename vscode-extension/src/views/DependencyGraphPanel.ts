/**
 * Dependency Graph Panel
 *
 * A webview panel that displays an interactive dependency graph
 * visualization using D3.js.
 */

import * as vscode from 'vscode';
import { SeuClaudeClient, DependencyNode } from '../SeuClaudeClient';

export class DependencyGraphPanel {
  public static currentPanel: DependencyGraphPanel | undefined;
  private static readonly viewType = 'seuClaudeDependencyGraph';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly client: SeuClaudeClient;
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, client: SeuClaudeClient): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (DependencyGraphPanel.currentPanel) {
      DependencyGraphPanel.currentPanel.panel.reveal(column);
      DependencyGraphPanel.currentPanel.update();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      DependencyGraphPanel.viewType,
      'Dependency Graph',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'resources')],
      }
    );

    DependencyGraphPanel.currentPanel = new DependencyGraphPanel(panel, extensionUri, client);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    client: SeuClaudeClient
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.client = client;

    this.update();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'openFile':
            const uri = vscode.Uri.file(message.file);
            await vscode.window.showTextDocument(uri);
            break;
          case 'refresh':
            await this.update();
            break;
        }
      },
      null,
      this.disposables
    );
  }

  private async update(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this.panel.webview.html = this.getEmptyHtml();
      return;
    }

    try {
      const nodes = await this.client.analyzeDependencies([editor.document.uri.fsPath]);
      this.panel.webview.html = this.getHtmlContent(nodes);
    } catch (error) {
      this.panel.webview.html = this.getErrorHtml(error);
    }
  }

  private getHtmlContent(nodes: DependencyNode[]): string {
    // Convert nodes to D3-compatible format
    const graphData = this.convertToGraphData(nodes);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dependency Graph</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    body {
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
    }

    #graph {
      width: 100vw;
      height: 100vh;
    }

    .node {
      cursor: pointer;
    }

    .node rect {
      fill: var(--vscode-button-background);
      stroke: var(--vscode-button-border);
      stroke-width: 1px;
      rx: 4;
    }

    .node:hover rect {
      fill: var(--vscode-button-hoverBackground);
    }

    .node text {
      fill: var(--vscode-button-foreground);
      font-size: 12px;
    }

    .link {
      fill: none;
      stroke: var(--vscode-editorWidget-border);
      stroke-width: 1.5px;
      opacity: 0.6;
    }

    .link:hover {
      stroke: var(--vscode-focusBorder);
      opacity: 1;
    }

    .arrow {
      fill: var(--vscode-editorWidget-border);
    }

    .controls {
      position: fixed;
      top: 10px;
      right: 10px;
      display: flex;
      gap: 8px;
    }

    .controls button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
    }

    .controls button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .tooltip {
      position: absolute;
      background: var(--vscode-editorHoverWidget-background);
      border: 1px solid var(--vscode-editorHoverWidget-border);
      padding: 8px;
      border-radius: 4px;
      font-size: 12px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
    }

    .tooltip.visible {
      opacity: 1;
    }
  </style>
</head>
<body>
  <div id="graph"></div>
  <div class="controls">
    <button onclick="zoomIn()">+</button>
    <button onclick="zoomOut()">-</button>
    <button onclick="resetZoom()">Reset</button>
    <button onclick="refresh()">Refresh</button>
  </div>
  <div id="tooltip" class="tooltip"></div>

  <script>
    const vscode = acquireVsCodeApi();
    const graphData = ${JSON.stringify(graphData)};

    const width = window.innerWidth;
    const height = window.innerHeight;

    const svg = d3.select('#graph')
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g');

    // Zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Arrow marker for links
    svg.append('defs').append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 25)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('class', 'arrow')
      .attr('d', 'M0,-5L10,0L0,5');

    // Force simulation
    const simulation = d3.forceSimulation(graphData.nodes)
      .force('link', d3.forceLink(graphData.links).id(d => d.id).distance(150))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(60));

    // Links
    const link = g.append('g')
      .selectAll('path')
      .data(graphData.links)
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('marker-end', 'url(#arrow)');

    // Nodes
    const node = g.append('g')
      .selectAll('g')
      .data(graphData.nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .call(d3.drag()
        .on('start', dragStarted)
        .on('drag', dragged)
        .on('end', dragEnded));

    node.append('rect')
      .attr('width', d => Math.max(d.name.length * 8 + 16, 80))
      .attr('height', 30)
      .attr('x', d => -Math.max(d.name.length * 8 + 16, 80) / 2)
      .attr('y', -15);

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 4)
      .text(d => d.name);

    node.on('click', (event, d) => {
      vscode.postMessage({ command: 'openFile', file: d.file });
    });

    // Tooltip
    const tooltip = d3.select('#tooltip');

    node.on('mouseover', (event, d) => {
      tooltip
        .html(\`<strong>\${d.name}</strong><br>Imports: \${d.imports}<br>Exports: \${d.exports}\`)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px')
        .classed('visible', true);
    });

    node.on('mouseout', () => {
      tooltip.classed('visible', false);
    });

    // Simulation tick
    simulation.on('tick', () => {
      link.attr('d', d => {
        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        return \`M\${d.source.x},\${d.source.y}L\${d.target.x},\${d.target.y}\`;
      });

      node.attr('transform', d => \`translate(\${d.x},\${d.y})\`);
    });

    function dragStarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragEnded(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    function zoomIn() {
      svg.transition().call(zoom.scaleBy, 1.3);
    }

    function zoomOut() {
      svg.transition().call(zoom.scaleBy, 0.7);
    }

    function resetZoom() {
      svg.transition().call(zoom.transform, d3.zoomIdentity);
    }

    function refresh() {
      vscode.postMessage({ command: 'refresh' });
    }
  </script>
</body>
</html>`;
  }

  private convertToGraphData(nodes: DependencyNode[]): {
    nodes: Array<{ id: string; name: string; file: string; imports: number; exports: number }>;
    links: Array<{ source: string; target: string }>;
  } {
    const graphNodes = nodes.map((node) => ({
      id: node.file,
      name: this.getFileName(node.file),
      file: node.file,
      imports: node.imports.length,
      exports: node.exports.length,
    }));

    const links: Array<{ source: string; target: string }> = [];
    const nodeFiles = new Set(nodes.map((n) => n.file));

    for (const node of nodes) {
      for (const imp of node.imports) {
        // Only add links to files we have info about
        if (nodeFiles.has(imp)) {
          links.push({ source: node.file, target: imp });
        }
      }
    }

    return { nodes: graphNodes, links };
  }

  private getFileName(filePath: string): string {
    return filePath.split('/').pop() || filePath;
  }

  private getEmptyHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
    }
  </style>
</head>
<body>
  <p>Open a file to view its dependency graph</p>
</body>
</html>`;
  }

  private getErrorHtml(error: unknown): string {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background: var(--vscode-editor-background);
      color: var(--vscode-errorForeground);
    }
  </style>
</head>
<body>
  <p>Error loading dependency graph: ${message}</p>
</body>
</html>`;
  }

  public dispose(): void {
    DependencyGraphPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) {
        d.dispose();
      }
    }
  }
}
