/*
 *  (c) Daniel Arroyo. 3DaGoGo, Inc. (daniel@astroprint.com)
 *
 *  Distributed under the GNU Affero General Public License http://www.gnu.org/licenses/agpl.html
 */

$.ajaxSetup({
    type: 'POST',
    cache: false,
    headers: {
    	"X-Api-Key": UI_API_KEY
    }
});

/******************/

var StepView = Backbone.View.extend({
	setup_view: null,
	events: {
		"submit form": "_onSubmit",
		"click .submit-action": "_onSubmitClicked"
	},
	initialize: function(params)
	{
		this.setup_view = params.setup_view;
	},
	onHide: function() {},
	onShow: function() {},
	onSubmit: function(data) {},
	_onSubmit: function(e)
	{
		e.preventDefault();
		var serializedData = $(e.currentTarget).serializeArray();
		var data = {};
		_.each(serializedData, function(item) {
			data[item.name] = item.value;
		});

		this.onSubmit(data);
	},
	_onSubmitClicked: function()
	{
		this.$el.find('form').submit();
		return false;
	}
});

/**************
* Welcome
***************/

var StepWelcome = StepView.extend({
	el: "#step-welcome"
});

/**************
* Name
***************/

var StepName = StepView.extend({
	el: "#step-name",
	currentName: null,
	constructor: function()
	{
		this.events["keyup input"] = "onNameChanged";
		this.events['click .failed-state button'] = 'onShow';
		StepView.apply(this, arguments);
	},
	onShow: function()
	{
		this.$el.removeClass('settings failed');
		this.$el.addClass('checking');
		$.ajax({
			url: API_BASEURL + 'setup/name',
			method: 'GET',
			dataType: 'json',
			success: _.bind(function(data) {
				this.currentName = data.name;
				this.$el.find('input').val(data.name).focus();
				this.render();
				this.$el.addClass('settings');
			}, this),
			error: _.bind(function(xhr) {
				this.$el.addClass('failed');
				this.$el.find('.failed-state h3').text(xhr.responseText);
			}, this),
			complete: _.bind(function() {
				this.$el.removeClass('checking');
			}, this)
		})
	},
	render: function(name)
	{
		if (name == undefined) {
			name = this.$el.find('input').val();
		}

		this.$el.find('.hotspot-name').text(name);
		this.$el.find('.astrobox-url').text(name);
	},
	onNameChanged: function(e)
	{
		var name = $(e.target).val();

		if (/^[A-Za-z0-9\-]+$/.test(name)) {
			this.render(name);
		} else if (name) {
			$(e.target).val( $(e.target).val().slice(0, -1) );
		} else {
			this.render('');
		}
	},
	onSubmit: function(data)
	{
		if (data.name != this.currentName) {
			this.$el.find('.loading-button').addClass('loading');
			$.ajax({
				url: API_BASEURL + 'setup/name',
				method: 'post',
				data: data,
				success: _.bind(function() {
					location.href = this.$el.find('.submit-action').attr('href');
				}, this),
				error: function(xhr) {
					if (xhr.status == 400) {
						message = xhr.responseText;
					} else {
						message = "There was an error saving your name";
					}
					noty({text: message, timeout: 3000});
				},
				complete: _.bind(function() {
					this.$el.find('.loading-button').removeClass('loading');
				}, this)
			});
		} else {
			location.href = this.$el.find('.submit-action').attr('href');
		}
	}
});

/**************
* Internet
***************/

var StepInternet = StepView.extend({
	el: "#step-internet",
	networkListTemplate: null,
	networks: null,
	passwordDialog: null,
	initialize: function()
	{
		_.extend(this.events, {
			'click .failed-state button': 'onShow',
			'click .settings-state button.connect': 'onConnectClicked',
			'change .hotspot-off input': 'hotspotOffChanged'
		});
	},
	onShow: function()
	{
		this.$el.removeClass('success settings failed');
		this.$el.addClass('checking');
		$.ajax({
			url: API_BASEURL + 'setup/internet',
			method: 'GET',
			dataType: 'json',
			success: _.bind(function(data) {
				if (data && data.connected) {
					this.$el.addClass('success');
				} else {
					if (!this.networkListTemplate) {
						this.networkListTemplate = _.template( $("#wifi-network-list-template").html() )
					}
					var list = this.$el.find('.settings-state .wifi-network-list');
					list.empty();

					this.networks = _.sortBy(_.uniq(_.sortBy(data.networks, function(el){return el.name}), true, function(el){return el.name}), function(el){
						el.active = self.settings && self.settings.network.id == el.id;
						return -el.signal
					});

					list.html(this.networkListTemplate({
						networks: this.networks
					}));

					//Bind events
					list.find('ul li').bind('click', _.bind(this.networkSelected, this));

					this.$el.addClass('settings');
				}
			}, this),
			error: _.bind(function(xhr) {
				this.$el.addClass('failed');
				this.$el.find('.failed-state h3').text(xhr.responseText);
			}, this),
			complete: _.bind(function() {
				this.$el.removeClass('checking');
			}, this)
		})
	},
	networkSelected: function(e)
	{
		var networkRow = $(e.currentTarget);

		this.$('.wifi-network-list li.selected').removeClass('selected');
		networkRow.addClass('selected');

		var network = this.networks[networkRow.data('id')];
		if (network) {
			this.$('.settings-state button.connect').removeClass('disabled');
		}

		$('html,body').animate({
          scrollTop: this.$('.settings-state button.connect').offset().top
        }, 1000);
	},
	onConnectClicked: function()
	{
		var networkRow = this.$el.find('.wifi-network-list li.selected');

		if (networkRow.length == 1) {
			var network = this.networks[networkRow.data('id')];

			if (network.secured) {
				if (!this.passwordDialog) {
					this.passwordDialog = new WiFiNetworkPasswordDialog({parent: this});
				}

				this.passwordDialog.open(network);
			} else {
				this.doConnect({id: network.id, password: null});
			}
		}
	},
	hotspotOffChanged: function(e)
	{
		var target = $(e.currentTarget);

		$.ajax({
			url: '/api/setup/internet',
			method: 'PUT',
			data: JSON.stringify({
				'hotspotOnlyOffline': target.is(':checked')
			}),
			contentType: 'application/json',
			dataType: 'json'
		}).
		fail(function(){
			noty({text: "There was an error saving hotspot option.", timeout: 3000});
		})
	},
  startHotspot: function(e) {

    $.ajax({
      url: API_BASEURL + "settings/network/hotspot",
      type: "POST",
      success: _.bind(function(data, code, xhr) {
        //noty({text: 'Your '+PRODUCT_NAME+' has created a hotspot. Connect to <b>'+this.settings.hotspot.name+'</b>.', type: 'success', timeout:3000});
        this.settings.hotspot.active = true;
        //this.render();
        location.reload();
      }, this),
      error: function(xhr) {
        noty({text: xhr.responseText, timeout:3000});
      }
    });
  },
  stopHotspot: function(e) {

    $.ajax({
      url: API_BASEURL + "settings/network/hotspot",
      type: "DELETE",
      success: _.bind(function(data, code, xhr) {
        noty({text: 'The hotspot has been stopped', type: 'success', timeout:3000});
        this.settings.hotspot.active = false;
        this.render();
      }, this),
      error: function(xhr) {
        noty({text: xhr.responseText, timeout:3000});
      },
    });
  },
	doConnect: function(data, callback)
	{
		var loadingBtn = this.$el.find(".settings-state .loading-button");
		loadingBtn.addClass('loading');

    this.stopHotspot();

		$.ajax({
			url: API_BASEURL + 'setup/internet',
			type: 'POST',
			contentType: 'application/json',
			dataType: 'json',
			data: JSON.stringify({id: data.id, password: data.password})
		})
		.done(_.bind(function(data) {
			if (data.name) {

				var connectionCb = null;

				//Start Timeout
				var connectionTimeout = setTimeout(function(){
					connectionCb.call(this, {status: 'failed', reason: 'timeout'});
				}, 70000); //1 minute

				connectionCb = function(connectionInfo){
					switch (connectionInfo.status) {
						case 'disconnected':
						case 'connecting':
							//Do nothing. the failed case should report the error
						break;

						case 'connected':
							setup_view.eventManager.off('astrobox:InternetConnectingStatus', connectionCb, this);
							noty({text: "Your "+PRODUCT_NAME+" is now connected to "+connectionInfo.info.name+".", type: "success", timeout: 3000});
							loadingBtn.removeClass('loading');
							if (callback) callback(false);
							this.$el.removeClass('settings');
							this.$el.addClass('success');
							clearTimeout(connectionTimeout);
						break;

						case 'failed':
							setup_view.eventManager.off('astrobox:InternetConnectingStatus', connectionCb, this);
							if (connectionInfo.reason == 'no_secrets') {
								noty({text: "Invalid password for "+data.name+".", timeout: 3000});
							} else {
								noty({text: "Unable to connect to "+data.name+".", timeout: 3000});
							}
							loadingBtn.removeClass('loading');
							if (callback) callback(true);
							clearTimeout(connectionTimeout);
							break;

						default:
							setup_view.eventManager.off('astrobox:InternetConnectingStatus', connectionCb, this);
							noty({text: "Unable to connect to "+data.name+".", timeout: 3000});
							loadingBtn.removeClass('loading');
							clearTimeout(connectionTimeout);
							if (callback) callback(true);
					}
				};

				setup_view.eventManager.on('astrobox:InternetConnectingStatus', connectionCb, this);

			} else if (data.message) {
				noty({text: data.message, timeout: 3000});
				loadingBtn.removeClass('loading');
				if (callback) callback(true);
			}
		}, this))
		.fail(_.bind(function(){
      this.startHotspot();
			noty({text: "There was an error connecting.", timeout: 3000});
			loadingBtn.removeClass('loading');
			if (callback) callback(true);
		},this))
	}
});

var WiFiNetworkPasswordDialog = Backbone.View.extend({
	el: '#wifi-network-password-modal',
	events: {
    'click input.button.connect': 'showMessage',
		'click input.button.info': 'connectClicked',
		'submit form': 'showMessage',
		'click a.cancel': 'cancelClicked'
	},
	parent: null,
	template: _.template($('#wifi-network-password-modal-template').html()),
	initialize: function(params)
	{
		this.parent = params.parent;
	},
	render: function(wifiInfo)
	{
		this.$el.html( this.template({wifi: wifiInfo}) );
	},
	open: function(wifiInfo)
	{
		this.render(wifiInfo)
		this.$el.foundation('reveal', 'open', {
			close_on_background_click: false,
			close_on_esc: false
		});
		this.$el.one('opened', _.bind(function() {
			this.$el.find('.network-password-field').focus();
		}, this));
	},
  showMessage: function(e){
    if(this.$('form .network-password-field').val()){
      this.$('#content').hide();
      this.$('#infoMessage').show();
    }
  },
  showDialog: function(e){
    this.$('#infoMessage').hide();
    this.$('#content').show();
  },
	connectClicked: function(e)
	{
		e.preventDefault();

    this.showDialog()

		var form = this.$el.find('form');
		var loadingBtn = this.$el.find('.loading-button');
		var password = form.find('.network-password-field').val();

		loadingBtn.addClass('loading');
		this.parent.doConnect(
			{id: form.find('.network-id-field').val(), password: password},
			_.bind(function(error) { //callback
				loadingBtn.removeClass('loading');
				form.find('.network-password-field').val('');
				if (!error) {
					this.$el.foundation('reveal', 'close');
				}
			}, this)
		);
	},
	cancelClicked: function(e)
	{
		e.preventDefault();
		this.$el.foundation('reveal', 'close');
	}
});

/**************
* Astroprint
***************/

var StepAstroprint = StepView.extend({
	el: "#step-astroprint",
	initialize: function()
	{
		this.events["click a.logout"] = "onLogoutClicked";
	},
	onShow: function()
	{
		this.$el.removeClass('success settings');
		this.$el.addClass('checking');
		$.ajax({
			url: API_BASEURL + 'setup/astroprint',
			method: 'GET',
			success: _.bind(function(data) {
				if (data.user) {
					this.$el.addClass('success');
					this.$el.find('span.email').text(data.user);
				} else {
					this.$el.addClass('settings');
					this.$el.find('#email').focus();
				}
			}, this),
			error: _.bind(function() {
				this.$el.addClass('settings');
				this.$el.find('#email').focus();
			}, this),
			complete: _.bind(function() {
				this.$el.removeClass('checking');
			}, this)
		});
	},
	onSubmit: function(data) {
		this.$el.find('.loading-button').addClass('loading');
		$.ajax({
			url: API_BASEURL + 'setup/astroprint',
			method: 'post',
			data: data,
			success: _.bind(function() {
				location.href = this.$('.submit-action').attr('href');
			}, this),
			error: _.bind(function(xhr) {
				if (xhr.status == 400 || xhr.status == 401 || xhr.status == 503) {
					message = xhr.responseText;
				} else {
					message = "There was an error logging you in";
				}
				noty({text: message, timeout: 3000});
				this.$('#email').focus();
			}, this),
			complete: _.bind(function() {
				this.$('.loading-button').removeClass('loading');
			}, this)
		});
	},
	onLogoutClicked: function(e)
	{
		e.preventDefault();
		$.ajax({
			url: API_BASEURL + 'setup/astroprint',
			method: 'delete',
			success: _.bind(function() {
				this.$el.removeClass('success');
				this.$el.addClass('settings');
			}, this),
			error: _.bind(function(xhr) {
				noty({text: "Error logging you out", timeout: 3000});
			}, this)
		});
	}
});

/*******************
* Connect Printer
********************/

var StepConnectPrinter = StepView.extend({
	el: "#step-connect-printer",
	constructor: function()
	{
		StepView.apply(this, arguments);
	}
});

/**************
* Printer
***************/

var StepPrinter = StepView.extend({
	el: "#step-printer",
	template: _.template( $("#step-printer-template").html() ),
	onShow: function()
	{
		this._checkPrinters()
	},
	render: function(settings)
	{
		this.$('form').html(this.template({
			settings: settings
		}));
	},
	onSubmit: function(data) {
		this._setConnecting(true);
		$.ajax({
			url: API_BASEURL + 'setup/printer',
			method: 'post',
			data: data,
			success: _.bind(function() {
				//We monitor the connection here for status updates
				var socket = new SockJS(SOCKJS_URI);
				socket.onmessage = _.bind(function(e){
					if (e.type == "message" && e.data.current) {
						var flags = e.data.current.state.flags;
						if (flags.operational) {
							socket.close();
							this._setConnecting(false);
							location.href = this.$el.find('.submit-action').attr('href');
						} else if (flags.error) {
							noty({text: 'There was an error connecting to the printer.', timeout: 3000});
							socket.close();
							this._setConnecting(false);
						}
					}
				}, this);
			}, this),
			error: _.bind(function(xhr) {
				if (xhr.status == 400 || xhr.status == 401) {
					message = xhr.responseText;
				} else {
					message = "There was an error connecting to your printer";
				}
				noty({text: message, timeout: 3000});
				this._setConnecting(false);
			}, this)
		});
	},
	_checkPrinters: function()
	{
		this.$el.removeClass('success settings');
		this.$el.addClass('checking');
		$.ajax({
			url: API_BASEURL + 'setup/printer',
			method: 'GET',
			success: _.bind(function(data) {
				this.$el.addClass('settings');
				if (data.portOptions && (data.baudrateOptions || data.driver == 's3g')) {
					this.render(data);
					this.delegateEvents(_.extend(this.events, {
						'click a.retry-ports': 'retryPortsClicked',
						'change #settings-printer-driver': 'driverChanged'
					}));
				} else {
					noty({text: "Error reading printer connection settings", timeout: 3000});
				}
			}, this),
			error: _.bind(function(xhr) {
				this.$el.addClass('settings');
				if (xhr.status == 400) {
					message = xhr.responseText;
				} else {
					message = "Error reading printer connection settings";
				}
				noty({text: message, timeout: 3000});

			}, this),
			complete: _.bind(function() {
				this.$el.removeClass('checking');
			}, this)
		});
	},
	_setConnecting: function(connecting)
	{
		if (connecting) {
			this.$el.find('.loading-button').addClass('loading');
			this.$el.find('.skip-step').hide();
		} else {
			this.$el.find('.loading-button').removeClass('loading');
			this.$el.find('.skip-step').show();
		}
	},
	retryPortsClicked: function(e)
	{
		e.preventDefault();
		this.onShow();
	},
	driverChanged: function(e)
	{
		this.$el.removeClass('success settings');
		this.$el.addClass('checking');
		$.ajax({
			url: API_BASEURL + 'setup/printer/profile',
			method: 'POST',
			data: {
				driver: $(e.target).val()
			},
			success: _.bind(function() {
				this._checkPrinters();
			}, this),
			error: _.bind(function(xhr) {
				this.$el.addClass('settings');
				if (xhr.status == 400) {
					message = xhr.responseText;
				} else {
					message = "Error saving printer connection settings";
				}
				noty({text: message, timeout: 3000});

			}, this),
			complete: _.bind(function() {
				this.$el.removeClass('checking');
			}, this)
		});

	}
});

/**************
* Share
***************/

var StepShare = StepView.extend({
	el: "#step-share",
	constructor: function()
	{
		this.events["click .share-button.facebook"] = "onFacebookClicked";
		this.events["click .share-button.twitter"] = "onTwitterClicked";
		this.events["click .setup-done"] = "onSetupDone";
		StepView.apply(this, arguments);
	},
	onFacebookClicked: function(e)
	{
		e.preventDefault();
		window.open('https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(shareOptions.facebook.link),'facebook','width=740,height=280,left=300,top=300');
		this.$el.find('a.button.setup-done').show();
	},
	onTwitterClicked: function(e)
	{
		e.preventDefault();
		window.open('https://twitter.com/share?url='+encodeURIComponent(shareOptions.twitter.link)+'&text='+encodeURIComponent(shareOptions.twitter.copy),'twitter','width=740,height=280,left=300,top=300');
		this.$el.find('a.button.setup-done').show();
	},
	onSetupDone: function(e)
	{
		e.preventDefault();
		$.ajax({
			url: API_BASEURL + 'setup/done',
			method: 'post',
			success: function() {
				location.href = "/";
			},
			error: function() {
				noty({text: "There was an error saving your settings.", timeout: 3000});
			}
		});
	}
});

var SetupView = Backbone.View.extend({
	steps: null,
	current_step: 'welcome',
	router: null,
	eventManager: null,
	_socket: null,
	_autoReconnecting: false,
	_autoReconnectTrial: 0,
	_autoReconnectTimeouts: [1, 1, 2, 2, 2, 3, 3, 5, 5, 10],
	initialize: function()
	{
		this.steps = {
			'welcome': new StepWelcome({'setup_view': this}),
			'name': new StepName({'setup_view': this}),
			'internet': new StepInternet({'setup_view': this}),
			'astroprint': new StepAstroprint({'setup_view': this}),
			'connect-printer': new StepConnectPrinter({'setup_view': this}),
			'printer': new StepPrinter({'setup_view': this}),
			'share': new StepShare({'setup_view': this})
		};

		this.eventManager = Backbone.Events;
		this.router = new SetupRouter({'setup_view': this});
		this.connect();
	},
	connect: function()
	{
        this._socket = new SockJS(SOCKJS_URI);
        this._socket.onopen = _.bind(this._onConnect, this);
        this._socket.onclose = _.bind(this._onClose, this);
        this._socket.onmessage = _.bind(this._onMessage, this);
	},
   	reconnect: function() {
        this._socket.close();
        delete this._socket;
        this.connect();
    },
   	_onConnect: function() {
        self._autoReconnecting = false;
        self._autoReconnectTrial = 0;
    },
    _onClose: function(e) {
        if (e.code == 1000) {
            // it was us calling close
            return;
        }

        if (this._autoReconnectTrial < this._autoReconnectTimeouts.length) {
            var timeout = this._autoReconnectTimeouts[this._autoReconnectTrial];
            console.log("Reconnect trial #" + this._autoReconnectTrial + ", waiting " + timeout + "s");
            setTimeout(_.bind(this.reconnect, this), timeout * 1000);
            this._autoReconnectTrial++;
        }
    },
    _onMessage: function(e) {
    	if (e.data && e.data['event']) {
            var data = e.data['event'];
            var type = data["type"];

            if (type == 'InternetConnectingStatus') {
            	this.eventManager.trigger('astrobox:InternetConnectingStatus', data["payload"]);
           	}
        }
    },
	setStep: function(step)
	{
		if (this.steps[step] != undefined) {
			this.steps[this.current_step].$el.addClass('hide');
			this.steps[this.current_step].onHide();
			this.steps[step].$el.removeClass('hide');
			this.steps[step].onShow();
			this.current_step = step;
		} else {
			this.router.navigate("", {trigger: true, replace: true});
		}
	}
});

var SetupRouter = Backbone.Router.extend({
	setup_view: null,
	routes: {
		"": "setStep",
		":step": "setStep",
		"*notFound": "notFound"
	},
	initialize: function(params)
	{
		this.setup_view = params.setup_view;
	},
	setStep: function(step)
	{
		this.setup_view.setStep(step || 'welcome');
	},
	notFound: function()
	{
		this.navigate("", {trigger: true, replace: true});
	}
});

var setup_view = new SetupView();

Backbone.history.start();
