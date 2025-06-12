"use strict";

var genericPageSetup =
{
    debug: false,

    script_version: '7',
    style_version: undefined,

    // A web page can add extra menu buttons to this array before the page load event
    extra_menu_buttons: [],

    // Page URL with and without the hash/query part
    this_page_url: undefined,
    this_page_noarg_url: undefined,

    // Page header related variables
    header_elem: undefined,
    header_height: undefined,
    has_scrolled: false,
    last_scroll_pos: 0,
    header_is_hidden: false,

    // Page menu related variables
    menu_group_elem: undefined,
    menu_is_open: false,
    pending_menu_action: undefined,
    // Named history state values
    menu_closed_history_state: null,
    menu_open_history_state: 1,
    // Menu button DOM elements and visibility states
    update_pg_addr_menu_button_info:
    {
        id: 'update_pg_addr_button',
        button_elem: undefined,
        is_visible: false,
    },
    reset_pg_addr_menu_button_info:
    {
        id: 'reset_pg_addr_button',
        button_elem: undefined,
        is_visible: false,
    },

    // Relative URL path from the current page to the web site root (the location of this script is used as the root);
    // includes a trailing '/' unless empty (meaning that the current page is in the root)
    rel_path_to_root: (function pg_rel_path_to_root()
    {
        var scripts = document.getElementsByTagName('script');
        var re = new RegExp('^(.*?[^/])(?:/(?!/)|$)(.*)');
        var matches = re.exec(scripts[scripts.length - 1].src);
        var this_script_url_parts = [matches[1]].concat(matches[2].split('/')).slice(0, -1);
        matches = re.exec(location.href);
        var this_page_url_parts = [matches[1]].concat(matches[2].split('/')).slice(0, -1);
        var smallest_nbr_parts = Math.min(this_script_url_parts.length, this_page_url_parts.length);
        for (var nbr_common_parts = 0;
            nbr_common_parts < smallest_nbr_parts && this_script_url_parts[nbr_common_parts] == this_page_url_parts[nbr_common_parts];
            nbr_common_parts++);
        var nbr_backout_levels = (nbr_common_parts == 0 ? 0 : this_page_url_parts.length - nbr_common_parts);
        var rel_path =
            new Array(nbr_backout_levels + 1).join('../') +
            this_script_url_parts.slice(nbr_common_parts).join('/');
        if (rel_path.length > 0 && rel_path.slice(-1) != '/')
            rel_path += '/';
        return rel_path;
    })(),

    // Handles the page load event for the purpose of creating a page header and setting up related event handlers
    init: function pg_init()
    {
        this.style_version = getComputedStyle(document.documentElement).getPropertyValue('--style-version').trim() || '?';
        if (this.debug) console.log('Page loaded (script v' + this.script_version  + ', style v' + this.style_version + ')');
        this.refresh_page_info();
        // Disable the browser's automatic restoring of the scroll position when navigating the history (sometimes it
        // doesn't work, and sometimes it gets in the way) - we'll handle this ourselves
        history.scrollRestoration = 'manual';
        this.make_header();
        var that = this;
        window.addEventListener('scroll', function(){that.scroll_handler()}, false);
        setInterval(function(){that.time_handler()}, 200);
        var nav_event_handler = function(e){that.navigation_handler(e)};
        // Register a handler for the pageshow event (comes after the load event - or without the load event - when
        // navigating from a different page)
        window.addEventListener('pageshow', nav_event_handler, false);
        // Register a handler for the popstate event (comes when navigating from a different history entry for the same
        // page - and for some older browsers it also comes after the pageshow event when navigating from a different
        // page)
        window.addEventListener('popstate', nav_event_handler, false);
    },

    refresh_page_info: function pg_refresh_page_info()
    {
        this.this_page_url = location.href;
        this.this_page_noarg_url = this.this_page_url.split('#')[0].split('?')[0];
        this.set_menu_button_visible(this.reset_pg_addr_menu_button_info,
            this.this_page_url != this.this_page_noarg_url);
    },

    // Opens the page menu
    open_menu: function pg_open_menu()
    {
        this.menu_is_open = true;
        this.menu_group_elem.style.display = 'block';
        if (this.debug) console.log('Adding and going to menu-open state');
        // Create and go to the menu-open history state
        history.pushState({state: this.menu_open_history_state, scroll: window.pageYOffset}, '');
    },

    // Closes the page menu if it is open, and ensures that all state reflects that it is closed
    close_menu: function pg_close_menu()
    {
        this.menu_is_open = false;
        this.menu_group_elem.style.display = 'none';
        if (history.state.state == this.menu_open_history_state)
        {
            // We're in the menu-open history state, so go back to the menu-closed history state
            if (this.debug) console.log('Going back');
            history.back();
        }
    },

    update_pg_addr_menu_button: [
        'update_pg_addr_button',
        'Update page address with setup',
        'genericPageSetup.update_page_addr_with_settings()'
    ],

    reset_pg_addr_menu_button: [
        'reset_pg_addr_button',
        'Reset page address',
        'genericPageSetup.reset_page_addr()'
    ],

    feedback_menu_button: [
        'feedback_button',
        'Feedback',
        'genericPageSetup.open_feedback_form()',
    ],

    // Performs the action for the 'Update page address with setup' menu button
    update_page_addr_with_settings: function pg_update_page_addr_with_settings()
    {
        var url_with_settings = this.make_url_from_settings();
        if (this.debug) console.log('update_pg_addr_with_settings: ' + url_with_settings);
        history.replaceState(history.state, '', url_with_settings);
        this.refresh_page_info();
    },

    // Performs the action for the 'Reset page address' menu button
    reset_page_addr: function pg_reset_page_addr()
    {
        history.replaceState(history.state, '', this.this_page_noarg_url);
        this.refresh_page_info();
    },

    // Performs the action for the 'Feedback' menu button
    open_feedback_form: function pg_open_feedback_form()
    {
        var info = this.this_page_url + ' (modified ' + document.lastModified +
            ', script v' + this.script_version +
            ', style v' + this.style_version + ')\n';
        window.open(this.rel_path_to_root + 'feedback.html#' + encodeURIComponent(info), '_blank');
    },

    // Makes the specified menu button visible or invisible as specified, or applies the previously set visibility if
    // 'visible' is not true or false
    set_menu_button_visible: function pg_set_menu_button_visible(button_info, visible)
    {
        if (this.debug) console.log('Requested visibility of ' + button_info.id + ': ' + visible);
        if (visible === true || visible === false)
        {
            button_info.is_visible = visible;
        }
        if (button_info.button_elem)
        {
            if (this.debug) console.log('Setting visibility of ' + button_info.id + ' to ' + button_info.is_visible);
            button_info.button_elem.style.display = button_info.is_visible ? 'block' : 'none';
        }
    },

    // Handles click events on menu item buttons
    menu_item_click_handler: function pg_menu_item_click_handler(event)
    {
        // Prepare the menu item action for execution; the sequence of events is:
        //      1. The click event triggers this handler which prepares the action.
        //      2. The same click event then triggers the click handler on the underlying menu_group_elem.
        //      3. The menu_group_elem click handler closes the menu and goes back to the menu-closed history state.
        //      4. This triggers the history popstate event which triggers the navigation_handler.
        //      5. The navigation_handler executes the pending action prepared in step 1.
        // This sequence ensures that the browser is back in the normal menu-closed state before the action is executed.
        this.pending_menu_action = event.target.dataset.action;
    },

    // Handles key events when the menu is open, for the purpose of closing the menu when the Esc key is pressed
    menu_key_down_handler: function pg_menu_key_down_handler(event)
    {
        // This handler is attached to the page body element and receives events in the capturing phase (not the usual
        // bubbling phase which comes after the capturing phase), so it receives events before anything else on the page
        if (this.menu_is_open && event.key == 'Escape')
        {
            if (this.debug) console.log('Esc pressed');
            this.close_menu();
            // Prevent the key event from reaching any other element on the page
            event.stopPropagation();
        }
    },

    // Handles navigation events for the purpose of closing the menu, executing a pending menu action if any, and
    // generally avoiding the menu-open history state (which should never be entered on user navigation)
    navigation_handler: function pg_navigation_handler(event)
    {
        // This navigation handler is called on every navigation event (pageshow or popstate) triggered by the user or
        // by this script, but not on history.pushState which does not trigger any events
        this.refresh_page_info();
        if (history.state == null)
        {
            history.replaceState({state: this.menu_closed_history_state, scroll: window.pageYOffset}, '');
        }
        else if (history.state.state == this.menu_closed_history_state)
        {
            var that = this;
            var old_scroll = history.state.scroll;
            setTimeout(function(){that.scroll_and_hide_header(old_scroll)});
        }
        var pending_menu_action = this.pending_menu_action;
        this.pending_menu_action = undefined;
        if (this.debug) console.log('nav_hndlr from ' + event.type + ': (' + history.state.state + ', ' + history.state.scroll + ') ' +
            pending_menu_action + ' ' + this.this_page_url);
        // Ensure that the menu is closed in all cases where the navigation handler is called (the only case where we
        // want the menu to stay open is when it is deliberately opened via history.pushState, and that will not trigger
        // any call to the navigation handler)
        this.close_menu();
        if (pending_menu_action)
        {
            // There's a pending action from a menu item selected by the user, so execute that action now
            setTimeout(function(){eval(pending_menu_action)}, 0);
        }
    },

    // Handles scroll events for the purpose of showing or hiding the header depending on the scroll direction (most of
    // this functionality is implemented in the timer_handler to avoid degrading the browser's scroll performance)
    scroll_handler: function pg_scroll_handler()
    {
        this.has_scrolled = true;
    },

    // Handles regular timer ticks for the purpose of showing/hiding the header if scroll events have occurred since the
    // last tick, and for storing the scroll position in the current history entry for later restoration when navigating
    // back to this history entry
    time_handler: function pg_time_handler()
    {
        if (this.has_scrolled)
        {
            this.has_scrolled = false;
            var new_scroll_pos = window.pageYOffset;
            history.replaceState({state: history.state.state, scroll: new_scroll_pos}, '');
            if (!this.menu_is_open && !this.header_is_hidden &&
                new_scroll_pos > this.last_scroll_pos && new_scroll_pos > this.header_height)
            {
                // The header is visible, the menu is closed, and the page has scrolled down beyond the height of the
                // header, so hide the header
                this.header_elem.className = 'hidden';
                this.header_is_hidden = true;
            } else if (this.header_is_hidden && new_scroll_pos <= this.last_scroll_pos)
            {
                // The header is hidden and the page has scrolled up (or "scrolled" to the same position, which will
                // only happen when navigation to a page causes scroll_and_hide_header to "scroll" to the top and the
                // scroll position is already at the top), so reveal the header
                this.header_elem.className = '';
                this.header_is_hidden = false;
            }
            this.last_scroll_pos = new_scroll_pos;
        }
    },

    // Creates the page header and menu
    make_header: function pg_make_header()
    {
        var body_elem = document.getElementsByTagName('body')[0];

        var footer_elem = body_elem.appendChild(document.createElement('div'));
        footer_elem.classList.add('footer');
        footer_elem.innerHTML = '<a href="' + this.rel_path_to_root + 'terms.html">Terms<\/a>';

        this.header_elem = body_elem.appendChild(document.createElement('header'));

        var hs = '<div class="header_bar">';
        hs += '<a class="hdrhomebut" href="' + this.rel_path_to_root + 'index.html">PEW\'s Corner<\/a>';
        hs += '<button id="menubut" class="hdrnavbut">Menu<\/button>';
        hs += '<\/div>';
        this.header_elem.innerHTML = hs;

        this.extra_menu_buttons.push(
            this.update_pg_addr_menu_button,
            this.reset_pg_addr_menu_button,
            this.feedback_menu_button);

        this.menu_group_elem = body_elem.appendChild(document.createElement('div'));
        this.menu_group_elem.className = 'menu_bg';

        var menu_container_elem = this.menu_group_elem.appendChild(document.createElement('div'));
        menu_container_elem.className = 'menu_container';

        var menu = menu_container_elem.appendChild(document.createElement('div'));
        menu.id = menu.className = 'menu';

        var that = this;
        var menu_item_click_handler = function(e){that.menu_item_click_handler(e)};
        for (var i = 0; i < this.extra_menu_buttons.length; i++)
        {
            var button = menu.appendChild(document.createElement('button'));
            button.id = this.extra_menu_buttons[i][0];
            button.className = 'menuitembut';
            if (this.extra_menu_buttons[i] === this.update_pg_addr_menu_button)
            {
                this.update_pg_addr_menu_button_info.button_elem = button;
                this.set_menu_button_visible(this.update_pg_addr_menu_button_info, null);
            }
            if (this.extra_menu_buttons[i] === this.reset_pg_addr_menu_button)
            {
                this.reset_pg_addr_menu_button_info.button_elem = button;
            }
            button.dataset.action = this.extra_menu_buttons[i][2];
            button.appendChild(document.createTextNode(this.extra_menu_buttons[i][1]));
            button.addEventListener('click', menu_item_click_handler, false);
        }

        document.getElementById('menubut').addEventListener('click', function(){that.open_menu()}, false);
        // Add a click event handler to the menu background (which covers the entire browser window) so a click anywhere
        // (also on a menu button) will close the menu
        this.menu_group_elem.addEventListener('click', function(){that.close_menu()}, false);
        // Add a key event handler to the page body and make it active in the capturing phase (when the event is
        // propagating down through the DOM tree towards the event target), so the Esc key can be used to close the menu
        body_elem.addEventListener('keydown', function(e){that.menu_key_down_handler(e)}, /* useCapture */ true);

        this.header_height = this.header_elem.offsetHeight;
    },

    // Scrolls to the specified vertical position on the page and hides the header
    scroll_and_hide_header: function pg_scroll_and_hide_header(new_pos)
    {
        if (this.debug) console.log('scroll_and_hide_header: ' + new_pos);
        this.last_scroll_pos = 0;
        this.has_scrolled = true;
        if (typeof(new_pos) == 'number')
        {
            window.scrollTo(0, new_pos);
        }
    },

    // A web page can call this on the page load event to create a table of contents
    make_table_of_contents: function pg_make_table_of_contents()
    {
        function get_margin(level)
        {
            return level * (level + 2);
        }

        var toc_hdr_elem;
        var toc_div_elem = document.createElement('div');
        toc_div_elem.className = 'toc';
        var h_elems = document.querySelectorAll('h2, h3, h4, h5, h6');
        var ohtml = '';
        var counters = [];
        var max_numbering_level = Infinity;
        var max_numbering_level_defining_level = undefined;
        var h_name_counts = {};
        var h_nums = {};
        for (var i = 1; i <= h_elems.length; i++)
        {
            var h_elem = h_elems[i - 1];
            if (h_elem.className == "toc")
            {
                toc_hdr_elem = h_elem;
                toc_hdr_elem.parentNode.insertBefore(toc_div_elem, toc_hdr_elem.nextSibling);
            }
            var level = h_elem.tagName.substring(1) - 2;
            if (level <= max_numbering_level_defining_level)
            {
                max_numbering_level = Infinity;
                max_numbering_level_defining_level = undefined;
            }
            if (max_numbering_level_defining_level === undefined && h_elem.dataset.maxHeadingNumberingLevel)
            {
                max_numbering_level = h_elem.dataset.maxHeadingNumberingLevel - 2;
                max_numbering_level_defining_level = level;
            }
            // Get heading text and anchor name
            var h_text = h_elem.innerHTML;
            var h_name = h_text.trim().replace(/[^A-Za-z0-9\._-]/g, '_');
            if (h_name in h_name_counts)
            {
                h_name_counts[h_name]++;
                h_name += h_name_counts[h_name];
            }
            else
            {
                h_name_counts[h_name] = 1;
            }
            if (level <= max_numbering_level)
            {
                // Remove any higher-level counters
                counters.splice(level + 1);
                // Add 0-value counters up to current level, if needed
                var old_level = counters.length - 1;
                for (var j = level; j > old_level; j--)
                {
                    counters[j] = 0;
                }
                // Increment current-level counter
                counters[level]++;
                // Get heading number and the needed margins
                var h_num = counters.join('.');
                h_nums[h_name] = h_num;
                var h_num_margin = get_margin(level);
                var h_text_margin = get_margin(level + 1);
                // Add info to table of contents
                ohtml += '<a style="display:block" href="#' + h_name + '"><div style="float:left;margin-left:' + h_num_margin + 'ex">' +
                    h_num +
                    '<\/div><div style="margin-left:' + h_text_margin + 'ex">' +
                    h_text + '<\/div><\/a>';
                // Add section number to heading
                h_elem.innerHTML = h_num + '&nbsp;&nbsp;' + h_text;
            }
            // Add target anchor to heading
            var a_elem = document.createElement('a');
            a_elem.setAttribute('id', h_name);
            h_elem.parentNode.replaceChild(a_elem, h_elem);
            a_elem.appendChild(h_elem);
        }
        // Insert table of contents
        if (toc_hdr_elem)
        {
            toc_div_elem.innerHTML = ohtml;
        }

        // Update links to headings
        var a_elems = document.querySelectorAll('a.toc_ref[href]');
        for (var i = 0; i < a_elems.length; i++)
        {
            var a_elem = a_elems[i];
            var a_ref = a_elem.getAttribute('href').substring(1);
            a_elem.innerHTML = a_elem.innerHTML.replace('#', h_nums[a_ref]);
            var that = this;
            a_elem.addEventListener('click', function(){that.scroll_and_hide_header()}, false);
        }

        // Scroll to hash if requested by URL
        if (location.hash)
        {
            var target_elem = document.getElementById(location.hash.slice(1));
            if (target_elem)
            {
                var new_pos = window.pageYOffset + target_elem.getBoundingClientRect().top;
                this.scroll_and_hide_header(new_pos);
            }
        }
    },

    // A web page can call this on the page load event to update the page state from the URL hash (or URL query if no
    // hash); the provided page_settings_spec is saved for later use by make_url_from_settings
    apply_settings_from_url: function pg_apply_settings_from_url(page_settings_spec)
    {
        this.page_settings_spec = page_settings_spec;
        this.set_menu_button_visible(this.update_pg_addr_menu_button_info, true);
        const argstr = location.hash ? location.hash.slice(1) : location.href.split('?')[1];
        if (!argstr) return;
        const args = argstr.split('&');
        args.forEach(function(arg)
        {
            var key_val_pair = arg.split('=');
            var key = key_val_pair[0];
            var val = key_val_pair[1].split(',').map(v => decodeURIComponent(v));
            if (val.length == 1) val = val[0];
            var setting = page_settings_spec[key];
            if (setting)
            {
                if (setting.set)
                {
                    setting.set(val);
                }
                else if (setting.obj)
                {
                    if (!setting.attr)
                    {
                        setting.attr = setting.obj.type == 'checkbox' ? 'checked' : 'value';
                    }
                    if (typeof setting.obj[setting.attr] == 'boolean')
                    {
                        setting.obj[setting.attr] = (val == 'y');
                    }
                    else if (typeof setting.obj[setting.attr] == 'number')
                    {
                        setting.obj[setting.attr] = ((val === undefined || val.trim() == '') ? NaN : +val);
                    }
                    else if (setting.attr == 'innerHTML')
                    {
                        alert('Error: innerHTML is an unacceptable target for a URL setting!');
                    }
                    else
                    {
                        setting.obj[setting.attr] = val;
                    }
                }
            }
        });
    },

    // Creates a page URL including a hash containing the current page state (assuming that apply_settings_from_url was
    // called earlier)
    make_url_from_settings: function pg_make_url_from_settings()
    {
        var args = [];
        for (var key in this.page_settings_spec)
        {
            var setting = this.page_settings_spec[key];
            var val = undefined;
            if (setting.get)
            {
                val = setting.get();
            }
            else if (setting.obj)
            {
                if (!setting.attr)
                {
                    setting.attr = setting.obj.type == 'checkbox' ? 'checked' : 'value';
                }
                if (typeof setting.obj[setting.attr] == 'boolean')
                {
                    val = setting.obj[setting.attr] ? 'y' : 'n';
                }
                else
                {
                    val = setting.obj[setting.attr];
                }
            }
            if (val !== undefined)
            {
                if (!Array.isArray(val))
                {
                    val = [val];
                }
                args.push(key + '=' + val.map(v => encodeURIComponent(v)).join(','));
            }
        }
        return this.this_page_noarg_url + '#' + args.join('&');
    },
};

window.addEventListener('load', function(){genericPageSetup.init()}, false);
