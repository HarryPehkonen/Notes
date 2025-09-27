/**
 * Search Bar Component
 */
import { LitElement, html, css } from 'lit';

export class SearchBar extends LitElement {
    static styles = css`
        :host {
            display: block;
        }
    `;

    render() {
        return html`
            <div>Search Bar Component</div>
        `;
    }
}

customElements.define('search-bar', SearchBar);
