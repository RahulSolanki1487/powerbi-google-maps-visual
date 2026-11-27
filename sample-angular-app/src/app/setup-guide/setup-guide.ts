import { Component } from '@angular/core';
import { BUILD_SNIPPET, EMBED_BACKEND, EMBED_COMPONENT, EMBED_INSTALL } from './snippets';

/** The "How to setup" page: test here, use in a Power BI report, embed in an application. */
@Component({
  selector: 'app-setup-guide',
  templateUrl: './setup-guide.html',
  styleUrl: './setup-guide.css'
})
export class SetupGuide {
  protected readonly build = BUILD_SNIPPET;
  protected readonly embedInstall = EMBED_INSTALL;
  protected readonly embedComponent = EMBED_COMPONENT;
  protected readonly embedBackend = EMBED_BACKEND;
}
