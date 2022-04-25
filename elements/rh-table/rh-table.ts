import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { observed, bound, pfelement } from '@patternfly/pfe-core/decorators.js';

// Typescript doesn't like SCSS import
// @ts-ignore
import styles from './rh-table.scss';

// @todo Add design for sorting
// @todo Bug where fullscreen button doesn't show up sometimes in smaller reflow (hard to replicate)
// @todo Need to lock focus inside of component while in full screen
// @todo Pagination?
// @todo Search?
// @todo move to pfe-tools/pfe 2.0
// @todo after pfe 2.0 write tests
//    - Test to make sure full screen button shows up when table scrolls
//    - Tests for sorting results

/**
 * Debounce utility
 * @see https://decipher.dev/30-seconds-of-typescript/docs/debounce/
 */
const debounce:any = (fn: Function, delay:number = 300) => {
  let timeoutId: ReturnType<typeof setTimeout>;
  return function (this: any, ...args: any[]) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
};

interface hoveredObject {
  hoveredCoordinates: any,
  styleElement: any,
  styleSheet: any,
  checkInterval: any,
};

interface tableCellContentsObject {
  [index: number]: any[];
}

/**
 * Table
 * @slot - Place element content here
 */
@customElement('rh-table')
@pfelement()
export class RhTable extends LitElement {
  static readonly version = '{{version}}';

  static readonly styles = [styles];

  // @todo this is unused?
  // Check to see if the table has a top heading
  // @observed
  @property({ type: Boolean, attribute: 'top-heading', reflect: true }) topHeading?: false;

  // A comma separated list of columns that are sortable, set on the component tag
  // this value is 1 indexed, meaning the first column is 1, not 0
  // @example <rh-table sortable="1,3">
  @property({
    type: Array,
    attribute: 'sortable',
    reflect: true,
    converter: {
      fromAttribute: (value) => {
        if (value && value.length > 0) {
          return value.split(',').map(column => parseInt(column.trim()));
        }
      },
      toAttribute: (value:Array<number>) => {
        if (value && typeof value.toString === 'function') {
          return value.toString();
        }
      }
    }
  }) sortableColumns?: [];

  // If this attribute is present the table will have a fullscreen button if it's scrolling horizontally
  // @example <rh-table fullscreen>
  // @observed
  @property({ type: Boolean, attribute: 'fullscreen', reflect: true }) canFullScreen = true;

  private _overlay: HTMLElement | null | undefined = null;

  private hovered: hoveredObject = {
    hoveredCoordinates: null,
    styleElement: null,
    styleSheet: null,
    checkInterval: null,
  };

  public table: HTMLTableElement | null = null;

  private lastSortCol: number = 0;
  private resizeDebounce: number = 250;
  private sortOrder: string = "";
  private tableSortValues: any[] = [];
  private tableCellValues: tableCellContentsObject = {};
  private _debouncedCheckForScroll: Function|undefined;

  private _shadowWrapper: HTMLElement | null = null;
  private _openButton: HTMLElement | null = null;
  private _closeButton: HTMLElement | null = null;

  connectedCallback() {
    super.connectedCallback();

    // Make sure pointers are set
    this.table = this.table ? this.table : this.querySelector('table');

    // Make a random number to make sure generated element's in light DOM HTML id's are unique
    const newId = Math.random()
      .toString(36)
      .substring(2, 9);
    this.dataset.id = newId;
    // If we don't have an ID on the table, set one
    if (!this.id) {
      this.id = `rh-table--${newId}`;
    }
  }

  firstUpdated() {
    // @todo Wes to ask Rob what Render Root is
    this._shadowWrapper = this.renderRoot.querySelector("#wrapper");
    this._openButton = this.renderRoot.querySelector("#full-screen--open");
    this._closeButton = this.renderRoot.querySelector("#full-screen--close");
    this._overlay = this.renderRoot.querySelector(".overlay") as HTMLElement;

    if (this.canFullScreen) {
      this._debouncedCheckForScroll = debounce(this._checkForScroll, this.resizeDebounce);

      window.addEventListener('resize',
        () => {
          if (this._debouncedCheckForScroll) {
            this._debouncedCheckForScroll();
          }
        }
      );
    }
    this._processLightDom();
    // this.addEventListener(RhTable.events.sorted, this._sortedHandler);
  }

  disconnectedCallback() {
    if (this.table) {
      this.table.removeEventListener('mouseover', this._rowAndColumnHighlight);
    }
    window.removeEventListener('resize',
      () => {
        if (this._debouncedCheckForScroll) {
          this._debouncedCheckForScroll();
        }
      }
    );
  }

  render() {
    return html`
      <div id="wrapper" class="rh-docs">
        <button id="full-screen--open" @click=${this._setFullScreen} class="full-screen">
          <span class="hidden-text">Expand Table</span>
          <svg
            aria-hidden="true"
            focusable="false"
            data-prefix="fas"
            data-icon="expand-arrows-alt"
            class="svg-inline--fa fa-expand-arrows-alt fa-w-14"
            role="img"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 448 512"
          >
            <path
              fill="currentColor"
              d="M448 344v112a23.94 23.94 0 0 1-24 24H312c-21.39 0-32.09-25.9-17-41l36.2-36.2L224 295.6 116.77 402.9 153 439c15.09 15.1 4.39 41-17 41H24a23.94 23.94 0 0 1-24-24V344c0-21.4 25.89-32.1 41-17l36.19 36.2L184.46 256 77.18 148.7 41 185c-15.1 15.1-41 4.4-41-17V56a23.94 23.94 0 0 1 24-24h112c21.39 0 32.09 25.9 17 41l-36.2 36.2L224 216.4l107.23-107.3L295 73c-15.09-15.1-4.39-41 17-41h112a23.94 23.94 0 0 1 24 24v112c0 21.4-25.89 32.1-41 17l-36.19-36.2L263.54 256l107.28 107.3L407 327.1c15.1-15.2 41-4.5 41 16.9z"
            ></path>
          </svg>
        </button>
        <slot></slot>
      </div>
      <button id="full-screen--close" @click=${this._removeFullScreen} class="full-screen--close">
        <span class="hidden-text">Close</span>
        <svg
          aria-hidden="true"
          focusable="false"
          data-prefix="fas"
          data-icon="times"
          class="svg-inline--fa fa-times fa-w-11"
          role="img"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 352 512"
        >
          <path
            fill="currentColor"
            d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"
          ></path>
        </svg>
      </button>
      <div class="overlay" hidden></div>
    `;
  }

  @bound private _setFullScreen() {
    this._toggleFullScreen(true);
  }
  @bound private _removeFullScreen() {
    this._toggleFullScreen(false);
  }

  /**
   * Open or close the full screen mode of the table
   * @param {boolean} isFullScreen Desired state
   */
  @bound private _toggleFullScreen(makeFullScreen: Boolean) {
    if (makeFullScreen) {
      // Set a static height so layout doesn't change when fullscreen is pressed
      this.style.height = `${this.offsetHeight}px`;
      this.classList.add('full-screen');
      document.body.classList.add('rh-table--is-full-screen');

      if (this._shadowWrapper) {
        this._shadowWrapper.classList.add('table-full-screen');
      }
      if (this._overlay) {
        this._overlay.hidden = false;
      }
      window.addEventListener('keydown', this._handleEscPress);
    }
    else {
      this.classList.remove('full-screen');
      document.body.classList.remove('rh-table--is-full-screen');
      if (this._shadowWrapper) {
        this._shadowWrapper.classList.remove('table-full-screen');
      }
      if (this._overlay) {
        this._overlay.hidden = true;
      }
      this.removeAttribute('style');
      window.removeEventListener('keydown', this._handleEscPress);
    }
  }

  /**
   * Handle keyboard inputs
   * @param {object} event Event object from event listener
   */
  @bound private _handleEscPress(event: KeyboardEvent) {
    if (event.defaultPrevented) {
      return; // Do nothing if the event was already processed
    }
    switch (event.key) {
      case 'Esc': // IE/Edge specific value
      case 'Escape':
        event.preventDefault();
        // check to see if table is full screen
        if (document.body.classList.contains('rh-table--is-full-screen')) {
          // if it is, close it
          this._toggleFullScreen(false);
        }
        break;
      default:
        return; // Quit when this doesn't handle the key event.
    }
    // Cancel the default action to avoid it being handled twice
  }

  /**
   * Sort the data based on column heading
   * @param {object} event Event object from event listener
   */
  @bound private _sortData(event: any) {
    const row = event.target.dataset.row - 1;
    const col = event.target.dataset.col - 1;
    const thisCell = event.target;

    // check to see if this is re-sorting a row/col that has been sorted
    // already to swap the direction of the values if it has
    if (this.lastSortCol === col && this.sortOrder === 'az') {
      this.sortOrder = 'za';
    } else {
      this.sortOrder = 'az';
    }
    this.lastSortCol = col;

    function checkIfLetters(value: any) {
      const regex = RegExp('^d');
      return regex.test(value);
    }
    let sortedData = [];

    if (this.sortOrder === 'az') {
      sortedData = this.tableSortValues.sort(function (a, b) {
        let aParam = a[col].innerText;
        let bParam = b[col].innerText;
        const aIsLetters = checkIfLetters(aParam);
        const bIsLetters = checkIfLetters(bParam);
        if (typeof aParam === 'string' && aIsLetters && bIsLetters) {
          aParam = aParam.toUpperCase(); // ignore upper and lowercase
          bParam = bParam.toUpperCase(); // ignore upper and lowercase
        }

        if (aParam < bParam) {
          return -1;
        }
        if (aParam > bParam) {
          return 1;
        }
        // names must be equal
        return 0;
      });
    } else if (this.sortOrder === 'za') {
      sortedData = this.tableSortValues.sort(function (a, b) {
        let aParam = a[col].innerText;
        let bParam = b[col].innerText;

        const aIsLetters = checkIfLetters(aParam);
        const bIsLetters = checkIfLetters(bParam);
        if (typeof aParam === 'string' && aIsLetters && bIsLetters) {
          aParam = aParam.toUpperCase(); // ignore upper and lowercase
          bParam = bParam.toUpperCase(); // ignore upper and lowercase
        }

        if (aParam < bParam) {
          return 1;
        }
        if (aParam > bParam) {
          return -1;
        }
        // names must be equal
        return 0;
      });
    }

    // wrapper for the rows
    const wrapper = document.createElement('tbody');

    for (let rowIndex = 0; rowIndex < sortedData.length; rowIndex++) {
      // make a new row to insert the cells
      const rowWrapper = document.createElement('tr');
      const originalRow = sortedData[rowIndex][0].initialRow;
      let rowData = Object.values(this.tableCellValues[originalRow]);
      rowWrapper.append(...rowData);
      wrapper.appendChild(rowWrapper);
    }
    const tbody = this.querySelector('tbody');
    if (tbody && tbody.parentElement) {
      tbody.parentElement.replaceChild(wrapper, tbody);
    }
  }

  /**
   * Get the HTMLStyleElement object by HTML Element's ID
   * @param {string} stylesheetId HTML id of stylesheet element inDOM
   * @returns {HTMLStyleElement} The HTMLStyleElement object associated with the HTML Element
   */
  @bound private _getCSSStyleSheetById(stylesheetId: string) {
    const styleElement = this.querySelector(`#${stylesheetId}`) as HTMLStyleElement | null;
    if (styleElement && styleElement.sheet) {
      return styleElement.sheet;
    }
  }

  /**
   * Removes all style rules from provided stylesheet
   * @param {CSSSTyleSheet} stylesheet
   */
  @bound private _deleteAllRules(stylesheet: any) {
    // Get rid of old styles
    // Tried using a for loop, wasn't successful
    while (stylesheet.cssRules.length > 0) {
      stylesheet.deleteRule(0);
    }
  }

  /**
   * Function to highlight row, column, and currently hovered cell
   * Uses the CSSOM to add styles instead of doing a bunch of DOM Updates
   * @param {object} event Event object from event listener
   */
  @bound private _rowAndColumnHighlight(event: any) {
    // Get the nearest table cell
    let thisCell = event.target;
    if (thisCell.tagName !== 'th' || thisCell.tagName !== 'td') {
      thisCell = thisCell.closest('th, td');
    }
    if (!thisCell) return;

    // Get coordinates and add hover behavior
    const row = thisCell.dataset.row;
    const col = thisCell.dataset.col;
    if (event.target && row && col) {
      // If we're on the same cell as last time this was run we can avoid extra work
      if ([row, col] === this.hovered.hoveredCoordinates) {
        return;
      }

      this.hovered.hoveredCoordinates = [row, col];

      if (this.hovered.checkInterval) {
        clearInterval(this.hovered.checkInterval);
      }

      if (!this.hovered.styleElement) {
        this.hovered.styleElement = document.createElement('style');
        this.hovered.styleElement.id = `hoverStyles--${this.dataset.id}`;
        this.append(this.hovered.styleElement);
        this.hovered.styleSheet = this._getCSSStyleSheetById(
          this.hovered.styleElement.id
        );
      }

      // Remove all previous styles
      this._deleteAllRules(this.hovered.styleSheet);
      // @todo Don't like hardcoding fallback colors in JS, not sure what a better option is though
      const colHover = `#${this.id} [data-col="${col}"] {
        background: var(--rh-table--hoveredCol--Background, #EFF7FC);
      }`;
      const rowHover = `#${this.id} [data-row="${row}"] {
        background: var(--rh-table--hoveredRow--Background, #F3F3F3);
      }`;
      const intersectionHover = `#${this.id} [data-col="${col}"][data-row="${row}"] {
        background: var(--rh-table--hoveredIntersection--Background, #E0EDF4)
      }`;

      // Add styles
      this.hovered.styleSheet.insertRule(colHover, 0);
      this.hovered.styleSheet.insertRule(rowHover, 1);
      this.hovered.styleSheet.insertRule(intersectionHover, 2);

      /**
       * Remove row/col highlight if element is no longer hovered over
       */
      const hoverCheck = () => {
        // Uses CSS pseudo state to see what element is currently hovered
        const isHovered =
          thisCell ===
          thisCell.parentElement.querySelector(`[data-col="${col}"]:hover`);
        if (!isHovered) {
          this._deleteAllRules(this.hovered.styleSheet);
          this.hovered.hoveredCoordinates = null;
          clearInterval(this.hovered.checkInterval);
        }
      };
      this.hovered.checkInterval = setInterval(hoverCheck, 500);
    }
  }

  /**
   * Check to see if table scrolls, if so show/enable full screen functionality
   */
  @bound private _checkForScroll() {
    // console.log('checking for table scroll');
    // Checks for fullscreen attribute and conditions for a full screen button to work
    if (
      this.canFullScreen &&
      this.table &&
      this._shadowWrapper &&
      this.table.offsetWidth > this._shadowWrapper.offsetWidth
    ) {
      // Show fullscreen button
      this._openButton?.removeAttribute('hidden');
    } else {
      this._openButton?.setAttribute('hidden', "hidden");
    }
  }

  /**
   * Copy light DOM into shadow DOM and initialize behaviors
   */
  @bound private _processLightDom() {
    if (this.table && !this.classList.contains('rh-table--processed')) {
      //--------------------------------------------------
      // Begin best time to manipulate the table's markup
      // Modify elements when they're in not in the DOM yet
      //--------------------------------------------------
      const sortableColumns:Array<number> = this.sortableColumns ? this.sortableColumns : [];
      const newTable = this.table.cloneNode(true) as HTMLTableElement;
      this.tableSortValues = [];

      // Set data attributes for column and row index
      // Iterate over rows
      const tableRows = newTable.querySelectorAll('tr');
      for (let rowIndex = 0; rowIndex < tableRows.length; rowIndex++) {
        // @todo handle row/col spanning
        // Iterate over cells in each row
        const tableRow = tableRows[rowIndex];
        const tableCells = tableRow.querySelectorAll('td, th');

        let tableRowValues = [];
        // if the table is sortable, this adds the rows to an object for sorting
        if (sortableColumns) {
          this.tableCellValues[rowIndex] = Array.from(tableCells);
        }
        for (let colIndex = 0; colIndex < tableCells.length; colIndex++) {
          const tableCell = tableCells[colIndex] as HTMLElement;

          // Set col & row metadata
          tableCell.dataset.row = (rowIndex + 1).toString();
          tableCell.dataset.col = (colIndex + 1).toString();

          if (tableCell.innerText.length > 75) {
            tableCell.classList.add('content--lg');
          } else if (tableCell.innerText.length > 30) {
            tableCell.classList.add('content--md');
          }

          // If the table isn't sortable, don't bother pulling any of the data for sorting
          if (sortableColumns) {
            if (
              rowIndex === 0 &&
              sortableColumns.includes(colIndex + 1)
            ) {
              tableCell.addEventListener('click', this._sortData);
              tableCell.classList.add('sort-button');
            }

            tableRowValues.push({
              initialCol: colIndex,
              initialRow: rowIndex,
              innerText: tableCell.innerText.trim(),
            });

            // dump every cell into an object for lookup when sorting
            this.tableCellValues[rowIndex][colIndex] = tableCell;
          }
        }
        if (sortableColumns) {
          if (rowIndex !== 0) {
            this.tableSortValues.push(tableRowValues);
          }
        }
      }

      //--------------------------------------------------
      // End best time to manipulate the table's markup
      //--------------------------------------------------
      this.replaceChild(newTable, this.table);
      this.table = newTable;
      if (this.table) {
        this.table.addEventListener('mouseover', this._rowAndColumnHighlight);
      }
      // Setup row/col hover effects
      if (this.canFullScreen) {
        // @TODO enable this aain
        this._checkForScroll();
      }
      this.classList.add('rh-table--processed');
    }
  }
}



declare global {
  interface HTMLElementTagNameMap {
    'rh-table': RhTable;
  }
}
