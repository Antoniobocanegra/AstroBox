/*
 *  (c) Daniel Arroyo. 3DaGoGo, Inc. (daniel@astroprint.com)
 *
 *  Distributed under the GNU Affero General Public License http://www.gnu.org/licenses/agpl.html
 */

var SettingsPage = Backbone.View.extend({
	parent: null,
	initialize: function(params) {
		this.parent = params.parent;
	},
	show: function() {
		this.parent.$el.find('.settings-page').addClass('hide');
		this.$el.removeClass('hide');
	}
});

/***********************
* Printer - Connection
************************/

var PrinterConnectionView = SettingsPage.extend({
	el: '#printer-connection',
	template: _.template( $("#printer-connection-settings-page-template").html() ),
	settings: null,
	initialize: function(params)
	{
		this.listenTo(app.socketData, 'change:printer', this.printerStatusChanged );

		SettingsPage.prototype.initialize.call(this, params);
	},
	show: function() {
		//Call Super
		SettingsPage.prototype.show.apply(this);

		if (!this.settings) {
			this.getInfo();
		} else {
			this.render();
		}
	},
	getInfo: function()
	{
		this.$('a.retry-ports i').addClass('animate-spin');
		$.getJSON(API_BASEURL + 'settings/printer', null, _.bind(function(data) {
			if (data.serial) {
				this.settings = data;
				this.render(); // This removes the animate-spin from the link
			} else {
				noty({text: "No serial settings found.", timeout: 3000});
			}
		}, this))
		.fail(function() {
			noty({text: "There was an error getting serial settings.", timeout: 3000});
			this.$('a.retry-ports i').removeClass('animate-spin');
		})
	},
	render: function()
	{
		this.$('form').html(this.template({
			settings: this.settings
		}));

		this.printerStatusChanged(app.socketData, app.socketData.get('printer'));

		this.delegateEvents({
			'change #settings-baudrate': 'saveConnectionSettings',
			'change #settings-serial-port': 'saveConnectionSettings',
			'click a.retry-ports': 'retryPortsClicked',
			'click .loading-button.test-connection button': 'testConnection'
		});
	},
	retryPortsClicked: function(e)
	{
		e.preventDefault();
		this.getInfo();
	},
	saveConnectionSettings: function(e) {
		var connectionData = {};

		_.each(this.$('form').serializeArray(), function(e){
			connectionData[e.name] = e.value;
		});

		if (connectionData.port) {
			this.$('.loading-button.test-connection').addClass('loading');
			this.$('.connection-status').removeClass('failed connected').addClass('connecting');
			$.ajax({
				url: API_BASEURL + "connection",
				type: "POST",
				dataType: "json",
				contentType: "application/json; charset=UTF-8",
				data: JSON.stringify({
					"command": "connect",
					"driver": connectionData.driver,
					"port": connectionData.port,
					"baudrate": connectionData.baudrate ? parseInt(connectionData.baudrate) : null,
					"autoconnect": true,
					"save": true
				})
			})
			.fail(function(){
				noty({text: "There was an error testing connection settings.", timeout: 3000});
			});
		}
	},
	printerStatusChanged: function(s, value)
	{
		this.$('.connection-status').removeClass('connecting failed connected').addClass(value.status);

		if (value.status != 'connecting') {
			this.$('.loading-button.test-connection').removeClass('loading');
		}
	},
	testConnection: function(e)
	{
		e.preventDefault();
		this.saveConnectionSettings();
	}
});

/***********************
* Printer - Profile
************************/

var PrinterProfileView = SettingsPage.extend({
	el: '#printer-profile',
	template: _.template( $("#printer-profile-settings-page-template").html() ),
	settings: null,
	initialize: function(params)
	{
		SettingsPage.prototype.initialize.call(this, params);

		this.settings = app.printerProfile;
	},
	show: function() {
		//Call Super
		SettingsPage.prototype.show.apply(this);

		this.render();
	},
	render: function() {
		this.$el.html(this.template({
			settings: this.settings.toJSON()
		}));

		this.$el.foundation();

		this.$('#extruder-count').val(this.settings.get('extruder_count'));

		this.delegateEvents({
			"invalid.fndtn.abide form": 'invalidForm',
			"valid.fndtn.abide form": 'validForm',
			"change input[name='heated_bed']": 'heatedBedChanged',
			"change select[name='driver']": 'driverChanged'
		});
	},
	heatedBedChanged: function(e)
	{
		var target = $(e.currentTarget);
		var wrapper = this.$('.input-wrapper.max_bed_temp');

		if (target.is(':checked')) {
			wrapper.removeClass('hide');
		} else {
			wrapper.addClass('hide');
		}
	},
	driverChanged: function(e)
	{
		var target = $(e.currentTarget);
		var wrapper = this.$('.input-wrapper.cancel-gcode');

		if (target.val() == 's3g') {
			wrapper.addClass('hide');
		} else {
			wrapper.removeClass('hide');
		}
	},
	invalidForm: function(e)
	{
		if (e.namespace !== 'abide.fndtn') {
			return;
		}

		noty({text: "Please check your errors", timeout: 3000});
	},
	validForm: function(e) {
		if (e.namespace !== 'abide.fndtn') {
			return;
		}

		var form = this.$('form');
		var loadingBtn = form.find('.loading-button');
		var attrs = {};

		loadingBtn.addClass('loading');

		form.find('input, select, textarea').each(function(idx, elem) {
			var value = null;
			var elem = $(elem);

			if (elem.is('input[type="radio"], input[type="checkbox"]')) {
				value = elem.is(':checked');
			} else {
				value = elem.val();
			}

			attrs[elem.attr('name')] = value;
		});

		this.settings.save(attrs, {
			patch: true,
			success: _.bind(function() {
				noty({text: "Profile changes saved", timeout: 3000, type:"success"});
				loadingBtn.removeClass('loading');
				//Make sure we reload next time we load this tab
				this.parent.subviews['printer-connection'].settings = null;
			}, this),
			error: function() {
				noty({text: "Failed to save printer profile changes", timeout: 3000});
				loadingBtn.removeClass('loading');
			}
		});
	}
});

/*************************
* Network - Network Name
**************************/

var NetworkNameView = SettingsPage.extend({
	el: '#network-name',
	template: _.template( $("#network-name-settings-page-template").html() ),
	events: {
		"invalid.fndtn.abide form": 'invalidForm',
		"valid.fndtn.abide form": 'validForm',
		"keyup #network-name": 'nameChanged'
	},
	show: function() {
		//Call Super
		SettingsPage.prototype.show.apply(this);

		if (!this.settings) {
			$.getJSON(API_BASEURL + 'settings/network/name', null, _.bind(function(data) {
				this.settings = data;
				this.render();
			}, this))
			.fail(function() {
				noty({text: "There was an error getting current network name.", timeout: 3000});
			});
		}
	},
	render: function() {
		this.$el.html(this.template({
			settings: this.settings
		}));

		this.$el.foundation();
		this.delegateEvents(this.events);
	},
	nameChanged: function(e)
	{
		var target = $(e.currentTarget);
		var changedElem = this.$('span.network-name');

		changedElem.text(target.val());
	},
	invalidForm: function(e)
	{
		if (e.namespace !== 'abide.fndtn') {
			return;
		}

		noty({text: "Please check your errors", timeout: 3000});
	},
	validForm: function(e) {
		if (e.namespace !== 'abide.fndtn') {
			return;
		}

		var form = this.$('form');
		var loadingBtn = form.find('.loading-button');
		var attrs = {};

		loadingBtn.addClass('loading');

		form.find('input').each(function(idx, elem) {
			var elem = $(elem);
			attrs[elem.attr('name')] = elem.val();
		});


		$.ajax({
			url: API_BASEURL + 'settings/network/name',
			type: 'POST',
			contentType: 'application/json',
			dataType: 'json',
			data: JSON.stringify(attrs)
		})
			.done(_.bind(function(data) {
				noty({text: "Network name changed. Use it next time you reboot", timeout: 3000, type:"success"});
				//Make sure we reload next time we load this tab
				this.settings = data
				this.render();
				this.parent.subviews['network-name'].settings = null;
			}, this))
			.fail(function() {
				noty({text: "Failed to save network name", timeout: 3000});
			})
			.always(function(){
				loadingBtn.removeClass('loading');
			});
	}
});

/*************************
* Camera - Image/Video
**************************/

var CameraVideoStreamView = SettingsPage.extend({
	el: '#video-stream',
	template: _.template( $("#video-stream-settings-page-template").html() ),
	settings: null,
	settingsSizeDefault: '640x480',
	cameraName: 'No camera plugged',
	events: {
		"submit form": 'onFormSubmit',
		"click #buttonRefresh": "refreshPluggedCamera",
		"change #video-stream-encoding": "changeEncoding",
		"change #video-stream-size": "restrictFps",
		"change #video-stream-format": "reloadDataAndRestrictFps"
	},
	show: function(previousCameraName) {

		var form = this.$('form');
		var loadingBtn = form.find('.loading-button');

		//Call Super
		SettingsPage.prototype.show.apply(this);
		if (!this.settings) {

			$.getJSON(API_BASEURL + 'camera/connected')
			.done(_.bind(function(response){

				if(response.isCameraConnected){
					if(this.cameraName != response.cameraName){
						//previousCameraName = this.cameraName;
						this.cameraName = response.cameraName;
					}


					$.getJSON(API_BASEURL + 'settings/camera', null, _.bind(function(data) {

						if(data.structure){

							this.settings = data;

							$.getJSON(API_BASEURL + 'camera/has-properties')
							.done(_.bind(function(response){
								if(response.hasCameraProperties){

									$.getJSON(API_BASEURL + 'camera/is-resolution-supported',{ size: data.size })
									.done(_.bind(function(response){
										if(response.isResolutionSupported){
											this.videoSettingsError = null;
											this.render();
											if(previousCameraName){
												if(!(previousCameraName === this.cameraName)){
													this.saveData();
												}
											} else {
												this.refreshPluggedCamera();
												//this.saveData();
											}
										} else {
											//setting default settings
											this.settings.size = this.settingsSizeDefault;
											//saving new settings <- default settings
											$.ajax({
												url: API_BASEURL + 'settings/camera',
												type: 'POST',
												contentType: 'application/json',
												dataType: 'json',
												data: JSON.stringify(this.settings)
											});
											noty({text: "Lowering your camera input resolution", type: 'warning', timeout: 3000});
											this.videoSettingsError = null;
											this.saveData();
											this.render();
										}

									},this))
									.fail(function() {
										noty({text: "There was an error reading your camera settings.", timeout: 3000});
									})
									.always(_.bind(function(){
										loadingBtn.removeClass('loading');
									},this));
								} else {
									this.videoSettingsError = 'Unable to communicate with your camera. Please, re-connect the camera and try again...';
									this.render();
								}
							},this))
							.fail(_.bind(function(){
								this.videoSettingsError = 'Unable to communicate with your camera. Please, re-connect the camera and try again...';
								this.render();
							},this))
						} else {//camera plugged is not supported by Astrobox
							//this.cameraName = data.cameraName;
							this.videoSettingsError = 'The camera which was connected is not supported by Astrobox.<br>It is probably the minimal camera resolution is less than 640x480 (minimal resolution supported).';
							this.render();
						}
					}, this))
					.fail(function() {
						noty({text: "There was an error getting Camera settings.", timeout: 3000});
					});
				} else {
					this.videoSettingsError = null;
					this.cameraName = null;
					this.render();
				}
			},this));
		} else {
			this.render();
		}
	},
	changeEncoding: function(e){
		if(e.target.options[e.target.selectedIndex].value == 'vp8'){
			if($('#video-stream-format option:selected').val() == 'x-h264'){
				$('#video-stream-format').val('x-raw');
				this.reloadDataAndRestrictFps();
			}
			$('#video-stream-format').prop('disabled', 'disabled');
		} else {//h264
			$('#video-stream-format').prop('disabled', false);
		}
	},
	reloadDataAndRestrictFps: function(){

		var formatSelected = $('#video-stream-format option:selected').val();

		//force to get the new camera capabilites for this format
		this.settings = null;
		/////////
		this.restrictFps(formatSelected);
	},
	restrictFps: function(formatSelected){
		this.$('#video-stream-framerate').html('');

		if(!this.settings){
			$.ajax({
				url: API_BASEURL + 'settings/camera',
				type: 'POST',
				contentType: 'application/json',
				dataType: 'json',
				data: JSON.stringify({format:formatSelected})
			})
			.done(_.bind(function(data){
				this.settings = data;
				this._reloadFpsSelect(formatSelected);
			},this));
		} else {
			this._reloadFpsSelect();
		}


	},
	_reloadFpsSelect: function(){
		$.each(this.settings.structure.fps, _.bind(function(i, item) {
			if(item.resolution == this.$('#video-stream-size').val()) {
				if (this.settings.framerate == item.value){
					this.$('#video-stream-framerate').append($('<option>', {
				        		value: item.value,
				        		text : item.label,
				        		selected: 'selected'
			    			}
			    		)
			    	);
				} else {
					this.$('#video-stream-framerate').append($('<option>', {
				        		value: item.value,
				        		text : item.label
			    			}
			    		)
			    	);
				}
			}
		},this));
	},
	refreshPluggedCamera: function(){

		var previousCameraName = this.cameraName;

		this.$('#buttonRefresh').addClass('loading');

		$.post(API_BASEURL + 'camera/refresh-plugged')
		.done(_.bind(function(response){

			if(response.isCameraPlugged){
				this.settings = null;
				this.cameraName = '';
				this.show(previousCameraName);
			} else {
				this.cameraName = false;
				this.render();
			}

			this.$('#buttonRefresh').removeClass('loading');
		},this));
	},
	render: function() {
		this.$el.html(this.template({
			settings: this.settings
		}));

		if($('#video-stream-encoding option:selected').val() == 'vp8'){
			$('#video-stream-format').prop('disabled', 'disabled');
		}

		this.$el.foundation();

		this.delegateEvents(this.events);
	},
	onFormSubmit: function(e) {
	    e.preventDefault();
	    this.saveData();
		return false;
	},
	saveData: function()
	{
	    var form = this.$('form');
	    var loadingBtn = form.find('.loading-button');
		var attrs = {};

		loadingBtn.addClass('loading');

		form.find('input, select, textarea').each(function(idx, elem) {
			var value = null;
			var elem = $(elem);

			if (elem.is('input[type="radio"], input[type="checkbox"]')) {
				value = elem.is(':checked');
			} else {
				value = elem.val();
			}

			attrs[elem.attr('name')] = value;
		});

		$.getJSON(API_BASEURL + 'camera/is-resolution-supported',{ size: attrs.size })
		.done(_.bind(function(response){
			if(response.isResolutionSupported){
				$.ajax({
					url: API_BASEURL + 'settings/camera',
					type: 'POST',
					contentType: 'application/json',
					dataType: 'json',
					data: JSON.stringify(attrs)
				})
				.done(_.bind(function(data){
					this.settings = data;
					noty({text: "Camera changes saved", timeout: 3000, type:"success"});
					//Make sure we reload next time we load this tab
					//this.render();
					this.parent.subviews['video-stream'].settings = null;
				},this))
				.fail(function(){
					noty({text: "There was a problem saving camera settings", timeout: 3000});
				})
				.always(_.bind(function(){
					loadingBtn.removeClass('loading');
				},this));
			} else {
				noty({text: "The resolution is not supported by your camera", timeout: 3000});
			}
		},this))
		.fail(function(){
			noty({text: "There was a problem saving camera settings", timeout: 3000});
		})
		.always(_.bind(function(){
			loadingBtn.removeClass('loading');
		},this));
	}
});

/*************************
* Network - Connection
**************************/

var InternetConnectionView = SettingsPage.extend({
	el: '#internet-connection',
	template: _.template( $("#internet-connection-settings-page-template").html() ),
	networksDlg: null,
	settings: null,
	events: {
		'click .loading-button.list-networks button': 'listNetworksClicked'
	},
	initialize: function(params) {
		SettingsPage.prototype.initialize.apply(this, arguments);

		this.networksDlg = new WiFiNetworksDialog({parent: this});
	},
	show: function() {
		//Call Super
		SettingsPage.prototype.show.apply(this);

		if (!this.settings) {
			$.getJSON(API_BASEURL + 'settings/network', null, _.bind(function(data) {
				this.settings = data;
				this.render();
			}, this))
			.fail(function() {
				noty({text: "There was an error getting WiFi settings.", timeout: 3000});
			});
		}
	},
	render: function() {
		this.$el.html(this.template({
			settings: this.settings
		}));
	},
  tryConnect: function(promise,id, password, restartHotspot){
    $.ajax({
      url: API_BASEURL + 'settings/network/active',
      type: 'POST',
      contentType: 'application/json',
      dataType: 'json',
      data: JSON.stringify({id: id, password: password})
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
                app.eventManager.off('astrobox:InternetConnectingStatus', connectionCb, this);
                noty({text: "Your "+PRODUCT_NAME+" is now connected to "+data.name+".", type: "success", timeout: 3000});
                this.settings.networks['wireless'] = data;
                this.render();
                $.getJSON(API_BASEURL + 'settings/network/hotspot', null, _.bind(function(data) {
                  this.parent.subviews["wifi-hotspot"].settings = data;
                  this.parent.subviews["wifi-hotspot"].render();
                }, this))
                .fail(function() {
                  noty({text: "There was an error getting WiFi Hotspot settings.", timeout: 3000});
                });
                promise.resolve();
                clearTimeout(connectionTimeout);
              break;

              case 'failed':
                app.eventManager.off('astrobox:InternetConnectingStatus', connectionCb, this);
                if (connectionInfo.reason == 'no_secrets') {
                  message = "Invalid password for "+data.name+".";
                } else {
                  message = "Unable to connect to "+data.name+".";
                }
                promise.reject(message);
                clearTimeout(connectionTimeout);
                if (restartHotspot) {
                  //RELOAD SETTINGS ABOUT WIFI HOTSTPOT PREVENTING YOU NEVER HAS OPENED THIS VIEW
                  //AND STARTS THE HOTSPOT
                  var hotspotView = this.parent.subviews["wifi-hotspot"];
                  hotspotView.reloadSettings(hotspotView.startHotspot);
                }
                break;

              default:
                app.eventManager.off('astrobox:InternetConnectingStatus', connectionCb, this);
                promise.reject("Unable to connect to "+data.name+".");
                clearTimeout(connectionTimeout);
            }
            $.getJSON(API_BASEURL + 'settings/network', null, _.bind(function(data) {
              this.parent.subviews["internet-connection"].settings = data;
              this.parent.subviews["internet-connection"].render();
            }, this))
            .fail(function() {
              noty({text: "There was an error getting WiFi settings.", timeout: 3000});
            });
            //this.parent.subviews['internet-connection'].settings = null;
          };

          app.eventManager.on('astrobox:InternetConnectingStatus', connectionCb, this);

        } else if (data.message) {
          noty({text: data.message, timeout: 3000});
          promise.reject()
        }
      }, this))
      .fail(_.bind(function(){
        if (restartHotspot) {
          //RELOAD SETTINGS ABOUT WIFI HOTSTPOT PREVENTING YOU NEVER HAS OPENED THIS VIEW
          //AND STARTS THE HOTSPOT
          var hotspotView = this.parent.subviews["wifi-hotspot"];
          hotspotView.reloadSettings(hotspotView.startHotspot);
        }
        noty({text: "There was an error connecting to a Wifi net.", timeout: 3000});
        promise.reject();
      }, this));
  },
	connect: function(id, password, restartHotspot) {

    var promise = $.Deferred();

    if (restartHotspot) {

      $.ajax({
        url: API_BASEURL + "settings/network/hotspot",
        type: "DELETE"
      })
      .done( _.bind(function(data, code, xhr) {
          noty({text: 'The hotspot has been stopped', type: 'success', timeout:3000});
          this.tryConnect(promise,id, password, true)
      }, this))
      .fail( function(xhr) {
          noty({text: xhr.responseText + ". Wifi connection can not be created. Please, try again.", timeout:3000});
      });

    } else {

      this.tryConnect(promise,id, password, false);

    }

    return promise;
	},
	listNetworksClicked: function(e) {

		var el = $(e.target).closest('.loading-button');

		el.addClass('loading');

		this.listNetworks(true)
    .fail(function(){
			noty({text: "There was an error retrieving networks.", timeout:3000});
		}).
		always(function(){
			el.removeClass('loading');
		});
	},
  listNetworks: function(evalHotspotState){

    var promise = $.Deferred();

    $.getJSON(
      API_BASEURL + "settings/network/wifi-networks",
      _.bind(function(data) {
        if (data.message) {
          noty({text: data.message});
          promise.reject();
        } else if (data.networks) {
          var self = this;
          this.networksDlg.open(_.sortBy(_.uniq(_.sortBy(data.networks, function(el){return el.name}), true, function(el){return el.name}), function(el){
            el.active = self.settings.networks.wireless && self.settings.networks.wireless.name == el.name;
            return -el.signal
          }),evalHotspotState);
          promise.resolve();
        }
      }, this)
    ).
    fail(function(){
      promise.reject()
    });

    return promise;
  }
});

var WiFiNetworkPasswordDialog = Backbone.View.extend({
	el: '#wifi-network-password-modal',
	events: {
		'click button.connect': 'connectClicked',
		'submit form': 'connect'
	},
	template: _.template($('#wifi-network-password-modal-template').html()),
	parent: null,
  restartHotspot: null,
	initialize: function(params) {
		this.parent = params.parent;
	},
	render: function(wifiInfo)
	{
		this.$el.html( this.template({wifi: wifiInfo}) );
	},
	open: function(wifiInfo,restartHotspot) {
		this.render(wifiInfo);
    this.restartHotspot = restartHotspot;
		this.$el.foundation('reveal', 'open', {
			close_on_background_click: false,
			close_on_esc: false
		});
		this.$el.one('opened', _.bind(function() {
			this.$el.find('.network-password-field').focus();
		}, this));

    this.$el.find('button.secondary').on('click',_.bind(function(){
      this.$el.foundation('reveal', 'close');
      //Make sure we reload next time we load this tab
      this.parent.parent.subviews['internet-connection'].settings = null;
    },this));
	},
	connectClicked: function(e) {
		e.preventDefault();

		var form = this.$('form');
		form.submit();
	},
	connect: function(e) {
		e.preventDefault()
		var form = $(e.currentTarget);

		var id = form.find('.network-id-field').val();
		var password = form.find('.network-password-field').val();
		var loadingBtn = this.$('button.connect').closest('.loading-button');
		var cancelBtn = this.$('button.cancel');

		loadingBtn.addClass('loading');
		cancelBtn.hide();

		this.parent.connect(id, password,this.restartHotspot)
			.done(_.bind(function(){
				form.find('.network-password-field').val('');
				this.$el.foundation('reveal', 'close');
				loadingBtn.removeClass('loading');
				cancelBtn.show();
			}, this))
			.fail(_.bind(function(message){
				loadingBtn.removeClass('loading');
				cancelBtn.show();
				noty({text: message, timeout: 3000});
				this.$el.foundation('reveal', 'close');
			}, this));

		return false;
	}
});

var WiFiNetworksDialog = Backbone.View.extend({
	el: '#wifi-network-list-modal',
	networksTemplate: _.template( $("#wifi-network-modal-row").html() ),
	passwordDlg: null,
	parent: null,
	networks: null,
  networkSelected: null,
  loadingBtn: null,
	initialize: function(params) {
		this.parent = params.parent;
    $('#infoMessage input.button.success.connect').on('click', _.bind(this.confirmConnection,this) );
    $('#infoMessage input.button.secondary.cancel').on('click', _.bind(this.closeMessage,this) );
	},
	open: function(networks,evalHotspotState) {

		this.loadNetworksList(networks,evalHotspotState);

		this.$el.foundation('reveal', 'open');
	},
  loadNetworksList: function(networks,evalHotspotState){
    var content = this.$el.find('.modal-content');
    content.empty();

    this.networks = networks;

    content.html(this.networksTemplate({
      networks: this.networks
    }));

    content.find('button').bind('click', _.bind(this.networkSelection, this, evalHotspotState));
    this.$el.find('div .modal-actions.row').find('.secondary').on('click',_.bind(function(){
      this.$el.foundation('reveal', 'close');
    },this));

  },
  showMessage: function(e){

    this.$('#infoMessage p.titleMessage').html('You are trying to connect to <span class="name bold">' + this.networkSelected.name + '</span>.');
    this.$('#infoMessage p.bodyMessage').html('You will try to connect to '
      + this.networkSelected.name +
      '. For being able to do this, hotspot will be disable.</p><p align="center">During the process, <span class="name bold">if something go wrong</span>, for example: the wifi password is incorrect, <span class="name bold"> '
      + PRODUCT_NAME +
      ' will turn on the hotspot again for being accesible again</span>.');


    this.$('#direct-connect-dialog').hide();
    this.$('#infoMessage').show();

  },
  closeMessage: function(e){
    this.$('#infoMessage').hide();
    this.$('#direct-connect-dialog').show();
  },
	networkSelection: function(evalHotspotState,e) {
		e.preventDefault();

    var button = $(e.target);

    this.loadingBtn = button.closest('.loading-button');

    this.networkSelected = this.networks[button.data('id')];

    if (evalHotspotState) {

      $.ajax({
        url: '/api/settings/network/hotspot',
        method: 'GET',
        contentType: 'application/json',
        dataType: 'json'
      })
      .done(_.bind(function(data){
        if (data.hotspot) {
          if (data.hotspot.active) {
            this.showMessage();
          } else {
            this.doConnection(false);
          }
        } else {
          noty({text: "There was an error getting wifi device state.", timeout: 3000});
        }
      }, this))
      .fail(function(){
        noty({text: "There was an error getting wifi device state.", timeout: 3000});
      });

    } else {

      this.doConnection(true);

    }
	},
  confirmConnection: function(){
    this.$('#infoMessage').hide();
    this.$('#direct-connect-dialog').show();
    this.doConnection(true);
  },
  doConnection: function(restartHotspot){


    if (!this.passwordDlg) {
      this.passwordDlg = new WiFiNetworkPasswordDialog({parent: this.parent});
    }

    if (this.networkSelected.secured) {

      this.passwordDlg.open(this.networkSelected,restartHotspot);

    } else {

      this.loadingBtn.addClass('loading');

      this.parent.connect(this.networkSelected.id, null, restartHotspot)
        .done(_.bind(function(){
          this.$el.foundation('reveal', 'close');
          this.loadingBtn.removeClass('loading');
        }, this))
        .fail(_.bind(function(message){
          noty({text: message, timeout: 3000});
          this.loadingBtn.removeClass('loading');

          /*$.getJSON(
            API_BASEURL + "settings/network/wifi-networks",
            _.bind(function(data) {
              if (data.message) {
                noty({text: data.message});
              } else if (data.networks) {
                var self = this;
                this.loadNetworksList(_.sortBy(_.uniq(_.sortBy(data.networks, function(el){return el.name}), true, function(el){return el.name}), function(el){
                  el.active = self.parent.settings.networks.wireless && self.parent.settings.networks.wireless.name == el.name;
                  return -el.signal
                }),true);
              }
            }, this)
          )
          .fail(function(){
            noty({text: "There was an error retrieving networks.", timeout:3000});
            this.$el.foundation('reveal', 'close');
          })*/

        },this));
    }
  }
});

/*************************
* Network - Wifi Hotspot
**************************/

var WifiHotspotView = SettingsPage.extend({
	el: '#wifi-hotspot',
	template: _.template( $("#wifi-hotspot-settings-page-template").html() ),
	settings: null,
	events: {
		'click .loading-button.start-hotspot button': 'startHotspotClicked',
		'click .loading-button.stop-hotspot button': 'stopHotspotClicked'/*,
		'change .hotspot-off input': 'hotspotOffChanged'*/
	},
  wirelessName: null,
	show: function() {
		//Call Super
		SettingsPage.prototype.show.apply(this);

    this.reloadWirelessName()
    .done(_.bind(function(){
      if (!this.settings) {
        $.getJSON(API_BASEURL + 'settings/network/hotspot', null, _.bind(function(data) {
          this.settings = data;
          this.render();
        }, this))
        .fail(function() {
          noty({text: "There was an error getting WiFi Hotspot settings.", timeout: 3000});
        });
      }
    },this));
	},
	render: function() {
		this.$el.html(this.template({
			settings: this.settings
		}));
	},
  reloadWirelessName: function(){

    var promise = $.Deferred();

    $.ajax({
      url: API_BASEURL + 'settings/network',
      type: 'GET',
      dataType: 'json'
    })
    .done(_.bind(function(data) {
      if (data.networks.wireless) {
        this.wirelessName = data.networks.wireless.name;
      }
      promise.resolve();
    }, this))
    .fail(function(){promise.reject();})

    return promise;
  },
	startHotspotClicked: function(e) {

    $(e.target).closest('.loading-button').addClass('loading');

    if (!this.wirelessName) {
      this.reloadWirelessName()
      .done(_.bind(function(){
        this.evalHotspotEnablingProc(e);
      },this))
      .fail(_.bind(function(){
        noty({text: "There was an error getting WiFi settings.", timeout: 3000});
        $('#infoMessage').foundation('reveal', 'close');
      },this));
    } else {
      this.evalHotspotEnablingProc(e);
    }
	},
  evalHotspotEnablingProc: function(e){
    if (this.wirelessName) {

      this.$('#infoMessage').foundation('reveal', 'open', {
        close_on_background_click: false,
        close_on_esc: false
      });

      $('#infoMessage input.button.success.ok').on('click', _.bind(function(){
        $('#infoMessage').foundation('reveal', 'close');
        this.startHotspot();
      },this) );

      $('#infoMessage input.button.secondary.cancel').on('click', _.bind(this.cancelStartHotspot,this) );

    } else {
      this.startHotspot(e);
    }
  },
  cancelStartHotspot: function(e){
    this.$('.loading-button.start-hotspot.loading').removeClass('loading')
    $('#infoMessage').foundation('reveal', 'close');
    this.render();
  },
  reloadSettings: function(callback){
    $.getJSON(API_BASEURL + 'settings/network/hotspot', null, _.bind(function(data) {
        this.settings = data;
        if (callback) {
          callback.call(this);
        }
    }, this))
    .fail(function() {
      noty({text: "There was an error getting WiFi Hotspot settings.", timeout: 3000});
    });
  },
  startHotspot: function(e){

    $.ajax({
      url: API_BASEURL + "settings/network/hotspot",
      type: "POST"})
    .done(_.bind(function(data, code, xhr) {
      noty({text: 'Your '+PRODUCT_NAME+' has created a hotspot. Connect to <b>'+this.settings.hotspot.name+'</b>.', type: 'success', timeout:3000});
      this.settings.hotspot.active = true;
      this.render();
      this.parent.subviews['internet-connection'].settings = null;
    }, this))
    .fail(function(xhr) {
      noty({text: xhr.responseText, timeout:3000});
    })
    .always(function() {
      if (e) {//This function can be called from an scope wich e does not exist
        $(e.target).closest('.loading-button').removeClass('loading');
      }
    });
  },
	stopHotspotClicked: function(e) {


    $.getJSON(API_BASEURL + 'settings/network', null, _.bind(function(data) {

      this.parent.subviews["internet-connection"].settings = data;

      /*if (data.networks.wired.ip) {

        this.stopHotspot(e);

      } else {*/

        this.$('#advertMessage').foundation('reveal', 'open', {
          close_on_background_click: false,
          close_on_esc: false
        });

        $('#advertMessage input.button.success.ok').on('click', _.bind(function(){
          $('#advertMessage').foundation('reveal', 'close');
          this.parent.subviews['internet-connection'].listNetworks(false)
          .always(_.bind(function(){this.render();},this));
        },this) );

        $('#advertMessage input.button.secondary.cancel').on('click', _.bind(function(){
          $('#advertMessage').foundation('reveal', 'close');
          this.render();
        },this) );

      //}
    }, this))
    .fail(function() {
      noty({text: "There was an error getting WiFi settings.", timeout: 3000});
    });
	},
  stopHotspot: function(e){

    var el = $(e.target).closest('.loading-button');

    el.addClass('loading');

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
      complete: function() {
        el.removeClass('loading');
      }
    });
  }
	/*hotspotOffChanged: function(e)
	{
		var target = $(e.currentTarget);
		var checked = target.is(':checked');

		$.ajax({
			url: '/api/settings/network/hotspot',
			method: 'PUT',
			data: JSON.stringify({
				'hotspotOnlyOffline': checked
			}),
			contentType: 'application/json',
			dataType: 'json'
		})
			.done(_.bind(function(){
				this.settings.hotspot.hotspotOnlyOffline = checked;
			}, this))
			.fail(function(){
				noty({text: "There was an error saving hotspot option.", timeout: 3000});
			});
	}*/
});

/********************
* Software - Update
*********************/

var SoftwareUpdateView = SettingsPage.extend({
	el: '#software-update',
	events: {
		'click .loading-button.check button': 'onCheckClicked'
	},
	updateDialog: null,
	onCheckClicked: function(e)
	{
		var loadingBtn = this.$el.find('.loading-button.check');
		loadingBtn.addClass('loading');
		$.ajax({
			url: API_BASEURL + 'settings/software/check',
			type: 'GET',
			dataType: 'json',
			success: _.bind(function(data) {
				if (!this.updateDialog) {
					this.updateDialog = new SoftwareUpdateDialog();
				}

				this.updateDialog.open(data);
			}, this),
			error: function(xhr) {
				if (xhr.status == 400) {
					noty({text: xhr.responseText, timeout: 3000});
				} else {
					noty({text: "There was a problem checking for new software.", timeout: 3000});
				}
			},
			complete: function() {
				loadingBtn.removeClass('loading');
			}
		});
	}
});

var SoftwareUpdateDialog = Backbone.View.extend({
	el: '#software-update-modal',
	data: null,
	contentTemplate: null,
	open: function(data)
	{
		if (!this.contentTemplate) {
			this.contentTemplate = _.template( $("#software-update-modal-content").html() )
		}

		this.data = data;

		var content = this.$el.find('.content');
		content.empty();
		content.html(this.contentTemplate({data: data, date_format:app.utils.dateFormat}));

		content.find('button.cancel').bind('click', _.bind(this.close, this));
		content.find('button.go').bind('click', _.bind(this.doUpdate, this));

		this.$el.foundation('reveal', 'open');
	},
	close: function()
	{
		this.$el.foundation('reveal', 'close');
	},
	doUpdate: function()
	{
		var loadingBtn = this.$el.find('.loading-button');
		loadingBtn.addClass('loading');
		$.ajax({
			url: API_BASEURL + 'settings/software/update',
			type: 'POST',
			dataType: 'json',
			contentType: 'application/json',
			data: JSON.stringify({
				release_id: this.data.release.id
			}),
			success: function() {
				//reset the page to show updating progress
				location.reload();
			},
			error: function(xhr) {
				if (xhr.status == 400) {
					noty({text: xhr.responseText, timeout: 3000});
				} else {
					noty({text: "There was a problem updating to the new version.", timeout: 3000});
				}
				loadingBtn.removeClass('loading');
			}
		});
	}
});

/************************
* Software - Advanced
*************************/

var SoftwareAdvancedView = SettingsPage.extend({
	el: '#software-advanced',
	template: _.template( $("#software-advanced-content-template").html() ),
	resetConfirmDialog: null,
	sendLogDialog: null,
	clearLogDialog: null,
	settings: null,
	events: {
		'change #serial-logs': 'serialLogChanged'
	},
	initialize: function(params)
	{
		SettingsPage.prototype.initialize.apply(this, arguments);
		this.resetConfirmDialog = new ResetConfirmDialog();
		this.sendLogDialog = new SendLogDialog();
		this.clearLogDialog = new ClearLogsDialog({parent: this});
	},
	show: function()
	{
		//Call Super
		SettingsPage.prototype.show.apply(this);

		if (!this.settings) {
			$.getJSON(API_BASEURL + 'settings/software/advanced', null, _.bind(function(data) {
				this.settings = data;
				this.render();
			}, this))
			.fail(function() {
				noty({text: "There was an error getting software advanced settings.", timeout: 3000});
			});
		}
	},
	render: function()
	{
		this.$el.html(this.template({
			data: this.settings,
			size_format: app.utils.sizeFormat
		}));
	},
	serialLogChanged: function(e)
	{
		var target = $(e.currentTarget);
		var active = target.is(':checked');

		$.ajax({
			url: '/api/settings/software/logs/serial',
			method: 'PUT',
			data: JSON.stringify({
				'active': active
			}),
			contentType: 'application/json',
			dataType: 'json'
		})
		.done(function(){
			if (active) {
				$('#app').addClass('serial-log');
			} else {
				$('#app').removeClass('serial-log');
			}
		})
		.fail(function(){
			noty({text: "There was an error changing serial logs.", timeout: 3000});
		});
	}
});

var SendLogDialog = Backbone.View.extend({
	el: '#send-logs-modal',
	events: {
		'click button.secondary': 'doClose',
		'click button.success': 'doSend',
		'open.fndtn.reveal': 'onOpen'
	},
	onOpen: function()
	{
		this.$('input[name=ticket]').val('');
		this.$('textarea[name=message]').val('');
	},
	doClose: function()
	{
		this.$el.foundation('reveal', 'close');
		this.$('input[name=ticket]').val('');
		this.$('textarea[name=message]').val('');
	},
	doSend: function()
	{
		var button = this.$('.loading-button');

		var data = {
			ticket: this.$('input[name=ticket]').val(),
			message: this.$('textarea[name=message]').val()
		};

		button.addClass('loading');

		$.post(API_BASEURL + 'settings/software/logs', data)
			.done(_.bind(function(){
				noty({text: "Logs sent to AstroPrint!", type: 'success', timeout: 3000});
				this.$el.foundation('reveal', 'close');
				this.$('input[name=ticket]').val('');
				this.$('textarea[name=message]').val('');
			},this))
			.fail(function(){
				noty({text: "There was a problem sending your logs.", timeout: 3000});
			})
			.always(function(){
				button.removeClass('loading');
			});
	}
});

var ClearLogsDialog = Backbone.View.extend({
	el: '#delete-logs-modal',
	events: {
		'click button.secondary': 'doClose',
		'click button.alert': 'doDelete',
		'open.fndtn.reveal': 'onOpen'
	},
	parent: null,
	initialize: function(options)
	{
		this.parent = options.parent;
	},
	doClose: function()
	{
		this.$el.foundation('reveal', 'close');
	},
	doDelete: function()
	{
		this.$('.loading-button').addClass('loading');
		$.ajax({
			url: API_BASEURL + 'settings/software/logs',
			type: 'DELETE',
			contentType: 'application/json',
			dataType: 'json',
			data: JSON.stringify({}),
			success: _.bind(function() {
				this.parent.$('.size').text('0 kB');
				this.doClose()
			}, this),
			error: function(){
				noty({text: "There was a problem clearing your logs.", timeout: 3000});
			},
			complete: _.bind(function() {
				this.$('.loading-button').removeClass('loading');
			}, this)
		})
	}
});

var ResetConfirmDialog = Backbone.View.extend({
	el: '#restore-confirm-modal',
	events: {
		'click button.secondary': 'doClose',
		'click button.alert': 'doReset',
		'open.fndtn.reveal': 'onOpen'
	},
	onOpen: function()
	{
		this.$('input').val('');
	},
	doClose: function()
	{
		this.$el.foundation('reveal', 'close');
	},
	doReset: function()
	{
		if (this.$('input').val() == 'RESET') {
			var loadingBtn = this.$('.loading-button');
			loadingBtn.addClass('loading');

			$.ajax({
				url: API_BASEURL + 'settings/software/settings',
				type: 'DELETE',
				contentType: 'application/json',
				dataType: 'json',
				data: JSON.stringify({})
			})
			.done(function(){
				noty({text: "Device Reset, please wait for reload...", type: 'success', timeout: 7000});
				setTimeout(function(){
					location.href = "";
				}, 7000);
			})
			.fail(function(){
				loadingBtn.removeClass('loading');
				noty({text: "There was a problem with your reset.", timeout: 3000});
			});
		}
	}
});


/******************************************/

var SettingsMenu = Backbone.View.extend({
	el: '#settings-side-bar',
	subviews: null,
	initialize: function(params) {
		if (params.subviews) {
			this.subviews = params.subviews;
		}
	},
	changeActive: function(page) {
		var target = this.$el.find('li.'+page);
		this.$el.find('li.active').removeClass('active');
		target.closest('li').addClass('active');
		this.subviews[page].show();
	}
});

var SettingsView = Backbone.View.extend({
	el: '#settings-view',
	menu: null,
	subviews: null,
	initialize: function() {
		this.subviews = {
			'printer-connection': new PrinterConnectionView({parent: this}),
			'printer-profile': new PrinterProfileView({parent: this}),
			'network-name': new NetworkNameView({parent: this}),
			'internet-connection': new InternetConnectionView({parent: this}),
			'video-stream': new CameraVideoStreamView({parent: this}),
			'wifi-hotspot': new WifiHotspotView({parent: this}),
			'software-update': new SoftwareUpdateView({parent: this}),
			'software-advanced': new SoftwareAdvancedView({parent: this})
		};
		this.menu = new SettingsMenu({subviews: this.subviews});
	},
	onShow: function() {
		this.subviews['printer-connection'].show();
	}
});
