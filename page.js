"use strict";

var genericPageSetup =
{
    extra_menu_buttons: [],

    this_page_url: location.href,
    this_page_noarg_url: location.href.split('#')[0].split('?')[0],
    header_elem: undefined,
    header_height: undefined,
    has_scrolled: false,
    last_scroll_pos: 0,
    header_is_hidden: false,
    menu_group_elem: undefined,
    menu_is_open: false,
    last_history_state: null,
    next_history_state: null,
    timeout_id: null,

    rel_path_to_root: (function rel_path_to_root()
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

    scroll_handler: function scroll_hdlr()
    {
        this.has_scrolled = true;
    },

    time_handler: function time_hndlr()
    {
        if (this.has_scrolled)
        {
            this.has_scrolled = false;
            var new_scroll_pos = window.pageYOffset;
            if (!this.menu_is_open && !this.header_is_hidden && new_scroll_pos > this.last_scroll_pos && new_scroll_pos > this.header_height)
            {
                this.header_elem.className = 'hidden';
                this.header_is_hidden = true;
            } else if (this.header_is_hidden && new_scroll_pos < this.last_scroll_pos)
            {
                this.header_elem.className = '';
                this.header_is_hidden = false;
            }
            this.last_scroll_pos = new_scroll_pos;
        }
    },

    open_menu: function pg_open_menu()
    {
        this.menu_is_open = true;
        this.menu_group_elem.style.display = 'block';
    },

    close_menu: function pg_close_menu()
    {
        this.menu_is_open = false;
        this.menu_group_elem.style.display = 'none';
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

    make_header: function mk_hdr()
    {
        var body_elem = document.getElementsByTagName('body')[0];

        var footer_elem = document.createElement('div');
        footer_elem.classList.add('footer');
        footer_elem.innerHTML = '<a href="' + this.rel_path_to_root + 'terms.html">Terms<\/a>';
        body_elem.appendChild(footer_elem);

        this.header_elem = document.createElement('header');
        body_elem.appendChild(this.header_elem);

        var hs = '<div class="header_bar">';
        hs += '<a class="hdrhomebut" href="' + this.rel_path_to_root + 'index.html">PEW\'s Corner<\/a>';
        hs += '<button id="menubut" class="hdrnavbut">Menu<\/button>';
        hs += '<\/div>';
        this.header_elem.innerHTML = hs;

        this.menu_group_elem = document.createElement('div');
        this.menu_group_elem.className = 'menu_bg';
        body_elem.appendChild(this.menu_group_elem);

        hs = '<div class="menu_container">';
        hs += '<div id="menu" class="menu">';
        this.extra_menu_buttons.push(
            ['fb_but',
            'Feedback',
            'window.open("' + this.rel_path_to_root + 'feedback.html#' + encodeURIComponent(this.this_page_url) + '", "_blank")']);
        for (var i = 0; i < this.extra_menu_buttons.length; i++)
        {
            hs += '<button id="' + this.extra_menu_buttons[i][0] +
                '" class="menuitembut" onclick=\'' + this.extra_menu_buttons[i][2] +
                '\'>' + this.extra_menu_buttons[i][1] + '<\/button><br>'
        }
        hs += '<\/div>';
        hs += '<\/div>';
        this.menu_group_elem.innerHTML = hs;

        document.getElementById('menubut').addEventListener('click', function(){genericPageSetup.open_menu()}, false);
        this.menu_group_elem.addEventListener('click', function(){genericPageSetup.close_menu()}, false);
        this.header_height = this.header_elem.offsetHeight;
    },

    scroll_hide_hdr: function pg_scroll(new_pos)
    {
        this.last_scroll_pos = 0;
        this.has_scrolled = true;
        if (typeof(new_pos) == 'number')
            window.scrollTo(0, new_pos);
        else if (typeof(new_pos) == 'string')
            window.location.href = new_pos;
    },

    make_table_of_contents: function pg_make_toc()
    {
        function get_margin(level)
        {
            return level * (level + 2);
        }

        var toc_hdr_elem;
        var toc_div_elem = document.createElement('div');
        toc_div_elem.className = 'toc';
        var h_elems = document.querySelectorAll('h2, h3, h4, h5');
        var ohtml = '';
        var counters = [];
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
            // Get heading text, anchor name, heading number, and the needed margins
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
            var h_num = counters.join('.');
            h_nums[h_name] = h_num;
            var h_num_margin = get_margin(level);
            var h_text_margin = get_margin(level + 1);
            // Add info to table of contents
            ohtml += '<a style="display:block" href="#' + h_name + '"><div style="float:left;margin-left:' + h_num_margin + 'ex">' +
                h_num +
                '<\/div><div style="margin-left:' + h_text_margin + 'ex">' +
                h_text + '<\/div><\/a>';
            // Add target anchor and section number to heading
            h_elem.innerHTML = h_num + '&nbsp;&nbsp;' + h_text;
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
            a_elem.addEventListener('click', function(){that.scroll_hide_hdr()}, false);
        }

        // Scroll to hash if requested by URL
        if (location.hash)
        {
            var requested_hash = location.hash.slice(1);
            location.hash = '';
            location.hash = requested_hash;
        }
    },

    // FIXME: navigation_handler doesn't handle forward navigation to anchors within same page.
    navigation_handler: function nav_hndlr(current_history_state)
    {
        //console.log('nav_hndlr: ' + current_history_state + ' ' + location.href);
        if (current_history_state == null)
        {
            // This is the first time the page is loaded. The second history entry does not yet
            // exist.

            // Set the current history state to 0 to indicate that it is the first of our history
            // entries and that a second one exists (this first entry only exists to catch backward
            // navigation by the user, so an open menu can be closed instead of backing out of the
            // page)
            history.replaceState(0, '');
            // Add (and go to) the second history entry and set its state to 1 to indicate that
            // it is the second of our history entries (this is where we will always be, unless
            // the user navigates backwards)
            history.pushState(1, '');
            this.last_history_state = 1;
            this.next_history_state = null;
        }
        else if (current_history_state == 0)
        {
            // We entered history state 0 - the first of our 2 history entries, and the second one
            // already exists.

            // Only do something if next_history_state is null, meaning that a previous event for
            // the same state hasn't already scheduled a navigation away from this state
            if (this.next_history_state == null)
            {
                // If the user got here by navigating backwards from history state 1 with a closed
                // menu, then exit this page by continuing one step further back
                if (this.last_history_state == 1 && !this.menu_is_open)
                {
                    // Set next_history_state to non-null to prevent additional events for the
                    // current state from having any effect
                    this.next_history_state = -1;
                    // Schedule the navigation a little bit into the future so multiple events for
                    // the current state will have been handled (and ignored) before we set
                    // next_history_state back to null right before navigating (we need it to be
                    // null if the page is loaded from cache when the user navigates forward again)
                    var that = this;
                    setTimeout(function()
                    {
                        that.next_history_state = null;
                        // Before going back, schedule a new call to this navigation handler (to
                        // go forward to state 1 again) in case the back navigation fails (if it
                        // succeeds, the scheduled call will never happen because it will be
                        // cancelled by pagehide_handler or the browser itself)
                        that.timeout_id = setTimeout(function()
                        {
                            //console.log('Delayed action');
                            that.timeout_id = null;
                            that.navigation_handler(history.state);
                        }, 1000); // Some browsers take a long time to navigate back
                        //console.log('Going back');
                        history.back();
                    }, 10);
                }
                // Otherwise the user must have got here by navigating forwards to this page or
                // backwards from history state 1 with an open menu, so go forwards to history
                // state 1 (if the menu is open, it will be closed by this handler when state 1
                // is entered)
                else
                {
                    // Set next_history_state to non-null to prevent additional events for the
                    // current state from having any effect
                    this.next_history_state = 1;
                    // Schedule the navigation a little bit into the future so multiple events for
                    // the current state will have been handled (and ignored) before we set
                    // next_history_state back to null right after navigating
                    setTimeout(function()
                    {
                        //console.log('Going forward');
                        history.forward();
                    }, 10);
                }
            }
            this.last_history_state = 0;
        }
        else if (current_history_state == 1)
        {
            // We entered the second of our 2 history entries. This is where we want to stay.
            // Just make sure the menu is closed.
            this.close_menu();
            this.last_history_state = 1;
            this.next_history_state = null;
        }
    },

    pageshow_handler: function pageshow_hndlr()
    {
        //console.log('onpageshow');
        this.navigation_handler(history.state);
    },

    pagehide_handler: function pagehide_hndlr()
    {
        //console.log('onpagehide');
        clearTimeout(this.timeout_id);
        this.timeout_id = null;
    },

    apply_settings_from_url: function aply_settings_from_url(page_settings_spec)
    {
        this.page_settings_spec = page_settings_spec;
        const argstr = location.hash ? location.hash.slice(1) : location.href.split('?')[1];
        if (!argstr) return;
        const args = argstr.split('&');
        args.forEach(function(arg)
        {
            var key_val_pair = arg.split('=');
            var key = key_val_pair[0];
            var val = key_val_pair[1];
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
                        setting.attr = 'value';
                    }
                    if (typeof setting.obj[setting.attr] == 'boolean')
                    {
                        setting.obj[setting.attr] = (val == 'y');
                    }
                    else if (typeof setting.obj[setting.attr] == 'number')
                    {
                        setting.obj[setting.attr] = ((val === undefined || val.trim() == '') ? NaN : +val);
                    }
                    else
                    {
                        setting.obj[setting.attr] = val;
                    }
                }
            }
        });
    },

    make_url_from_settings: function mk_url_from_settings()
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
                    setting.attr = 'value';
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
                args.push(key + '=' + val);
            }
        }
        return this.this_page_noarg_url + '#' + args.join('&');
    },

    update_page_addr_with_settings: function update_pg_addr_with_settings()
    {
        history.replaceState(history.state, '', this.make_url_from_settings());
    },

    reset_page_addr: function reset_pg_addr()
    {
        history.replaceState(history.state, '', this.this_page_noarg_url);
    },

    init: function pg_init()
    {
        //console.log('onload');
        this.make_header();
        var that = this;
        window.addEventListener('scroll', function(){that.scroll_handler()}, false);
        setInterval(function(){that.time_handler()}, 200);
        window.addEventListener('popstate', function(e){that.navigation_handler(e.state)}, false);
        window.addEventListener('pageshow', function(){that.pageshow_handler()}, false);
        window.addEventListener('pagehide', function(){that.pagehide_handler()}, false);
        // Call the navigation handler to initialize the history entries (history.state should be
        // null at this point, unless the browser already called the popstate handler directly)
        this.navigation_handler(history.state);
    }
};

window.addEventListener('load', function(){genericPageSetup.init()}, false);
