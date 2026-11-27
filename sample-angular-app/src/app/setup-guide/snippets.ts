// Code samples shown in the "How to setup" page. Kept as strings so the Angular template does not parse their braces.

export const BUILD_SNIPPET = `# in the visual's repo root
npm install
npm run package          # -> dist/googleMapsVisual<guid>.<version>.pbiviz`;

export const EMBED_INSTALL = `npm install powerbi-client`;

export const EMBED_COMPONENT = `import { Component, ElementRef, OnInit, viewChild } from '@angular/core';
import * as pbi from 'powerbi-client';

@Component({
  selector: 'app-report',
  template: '<div #host style="height:600px"></div>'
})
export class ReportComponent implements OnInit {
  private host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private service = new pbi.service.Service(
    pbi.factories.hpmFactory, pbi.factories.wpmpFactory, pbi.factories.routerFactory);

  async ngOnInit() {
    // Your backend returns these. It calls the Power BI REST API with a service principal
    // (Reports - Get Report In Group, then Generate Token).
    const { reportId, embedUrl, embedToken } =
      await (await fetch('/api/powerbi/embed-config')).json();

    this.service.embed(this.host().nativeElement, {
      type: 'report',
      id: reportId,
      embedUrl,
      accessToken: embedToken,
      tokenType: pbi.models.TokenType.Embed,   // app owns data
      settings: { panes: { filters: { visible: false } } }
    });
  }
}`;

export const EMBED_BACKEND = `// Pseudocode for GET /api/powerbi/embed-config (any language / framework)
1. Get an Azure AD token for the service principal
   scope: https://analysis.windows.net/powerbi/api/.default
2. GET  https://api.powerbi.com/v1.0/myorg/groups/{workspaceId}/reports/{reportId}
   -> returns embedUrl
3. POST https://api.powerbi.com/v1.0/myorg/groups/{workspaceId}/reports/{reportId}/GenerateToken
   body: { "accessLevel": "View" }
   -> returns token
4. Return { reportId, embedUrl, embedToken: token } to the browser`;
