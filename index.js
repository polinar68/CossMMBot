const $tls = require("tls");
const $url = require("url");
const $https = require("https");
const $util = require("util");
const $crypto = require("crypto");
const $fs = require("fs");
const $events = require("events"); 
const $assert = require("assert").strict;
var $private = "";
var $public = "";

class MMBot {

	/**
	 * The main and unique class for market making on 
	 * the COSS plateform for a complete documentation
	 * see : https://github.com/cyrus1996/CossMMBot
	 */


	constructor($spec,priv,pub){

		$private = priv;
		$public = pub;

		/**
		 * @var _spec <Object>
		 *
		 * 
		 * an Object that contains
		 * every specification for every 
		 * pair that we want to trade on 
		 */

		this._spec = {}

		/**
		 * @var _ob_list <Object>
		 *
		 * created in => this.createOrderbook()
		 *
		 * an Object that stores all the 
		 * order books of the pairs we are 
		 * trading on
		 */

		this._ob_list = {}

		/**
		 * @var _amount_min <Map>
		 *
		 * The map pair => min_amount that represents
		 * the minimum amount to trade on the base pairs
		 * (eg ETH: 0.02, COSS: 25)
		 */

		this._amount_min = new Map();

		/**
		 * @var _decimal <Map>
		 * 
		 * the specification given by 
		 * the exchange for every pair
		 * formed like this : 
		 * Pair => {price_decimal,amount_decimal}
		 */

		this._decimal = new Map()

		/**
		 * @var _wallet <Object>
		 *
		 * created in => this.getWallet
		 * 
		 * Stores your wallet specifications and amount
		 */

		this._wallet = {}


		/**
		 * @var _callcounter <Int>
		 *
		 * the number of call done to the API 
		 * this variable allows us to prevent 
		 * reaching the API limit calls
		 */

		this._callcounter = 15;

		/**
		 * @var _cookie <String>
		 *
		 * this variable is used to make the call
		 * to the specific exchange url to cancel 
		 * all of open orders regardless of the pair
		 * for more details see spec []
		 */

		this._cookie = "";

		/**
		 * @var _kill <String>
		 *
		 * this variable is used to prevent 
		 * from opening new orders when the 
		 * exiting process started.
		 */

		this._kill = false;

		/**
		 * @var $spec <String>
		 *
		 * this variable is used to store 
		 * our pair details for the order 
		 * opening process
		 */

		this._spec = $spec;

		/**
		 * @var _error <Bool>
		 *
		 * this variable is used to
		 * display a warning message if something 
		 * went wrong when cancelling the orders.
		 */

		this._error = false;

		this._exception = 0;

		this._exit = 0;

		this._interval = {

			"pair": [],
			"index": 0,
			"side": true,
			"lock": true

		}

		process.on("SIGINT", async () => {

			this._exit++;

			console.log("LOG: " + new Date().toUTCString() + " received SIGINT, starting the cancelling process after 12 sec (please wait for 12 sec)")

			if (this._exit >= 5) {

				console.log("\x1B[91;1mFATAL ERROR: " + new Date().toUTCString() + " >=5 ^C token received, process got killed, please check right now " +
				"the exchange to close any remaining order\x1B[0m");
				process.exit();

			} else if (this._exit > 1) {

				return true;

			}

			/**
			 * if the ctrl-C token is sent to the 
			 * program we need to cancel all the open orders
			 * to prevent any possible loss.
			 */

			/**
			 * we set the _kill variable to 
			 * true, doing so will prevent new orders 
			 * to be opened
			 */

			this._kill = true;

			/**
			 * before starting the 
			 * cancelling process we need to wait for at
			 * least 10 sec because this is the minimum
			 * lifetime of an opened order, cancelling an order
			 * before 10 sec after opened it result in a soft ban 
			 * of the API for 5min.
			 */

			setTimeout(async () => {

				console.log("LOG: " + new Date().toUTCString() + " 12 sec elapsed starting cancelling process");

				/**
				 * if the cancelOnce method 
				 * worked we can safely exit the program
				 */

				console.log("LOG: " + new Date().toUTCString() + " trying to cancel all orders at once with cancelOnce method")

				if (await this.cancelOnce()) {

					console.log("\x1B[1mFINISH\x1B[0m: " + new Date().toUTCString() + " all orders have succefully been cancelled. Thanks for using me :)")

					process.exit();

				} else {

					console.log("\x1B[38;5;226mNOTICE\x1B[0m: " + new Date().toUTCString() + " CancelOnce method returned false and didn't worked properly" +
						" starting to cancel every pair one at a time")

					/** 
					 * if the cancel once method didn't 
					 * worked we need to cancel orders on each
					 * pair separately.
					 */

					for(var pair in this._spec){

						/**
						 * if the auto_kill attribute of the pair 
						 * is set to false we dont close the orders 
						 */

						if(!this._spec[pair]["created"]) continue;

						if (!this._spec[pair]["auto_kill"]) {

							console.log("LOG: " + new Date().toUTCString() + " didn't cancel on " + pair + " cause on "+ pair +" : auto_kill = false");
							continue;
						}

						/**
						 * if the cancelAllOrders method returned false
						 * this means we reached our api limits calls
						 * so we need to wait for 1 minute in order to 
						 * reset our api limit calls.
						 */

						console.log("LOG: " + new Date().toUTCString() + " start using cancelAllOrders on " + pair);

						if(!await this.cancelAllOrders(pair)){

							var error = await this.timerCancelAll(pair);

							!error ? this._error = true : false;
						}

					}

					if (this._error) {

						console.log("\x1B[91mWARNING\x1B[0m: " + new Date().toUTCString() + " All orders weren't cancelled properly log " +
							"in the plateform and manually close them");
						process.exit()

					} else {

						console.log("\x1B[1mFINISH\x1B[0m: " + new Date().toUTCString() + " all orders have succefully been cancelled. Thanks for using me :)")
						process.exit();

					}
				}

			},12000)

		})

		process.on("uncaughtException", async (err) => {

			/**
			 * Similar to what's above.
			 */

			this._kill = true;

			this._exception++;

			console.log("\x1B[91;1mERROR\x1B[0m:" + new Date().toUTCString() + " the error which stopped the program : ", err);

			if (this._exception > 1) {

				console.log("\x1B[91;1mFATAL ERROR: " + new Date().toUTCString() + " An error occured during error handling, process got killed, please check right now " +
					"the exchange to close any remaining order\x1B[0m");
				process.exit();

			}

			setTimeout(async () => {

				console.log("LOG: " + new Date().toUTCString() + " trying to cancel all orders at once with cancelOnce method");

				if (await this.cancelOnce()) {

					console.log("\x1B[1mFINISH\x1B[0m: " + new Date().toUTCString() + " all orders have succefully been cancelled. Thanks for using me :)")

					process.exit();

				} else {

					console.log("\x1B[38;5;226mNOTICE\x1B[0m: " + new Date().toUTCString() + " CancelOnce method returned false and didn't worked properly" +
						" starting to cancel every pair one at a time");

					for(var pair in this._spec){

						if(!this._spec[pair]["created"]) continue;

						console.log("LOG: " + new Date().toUTCString() + " start using cancelAllOrders on " + pair);

						if(!await this.cancelAllOrders(pair)){
							
							var error = await this.timerCancelAll(pair);

							!error ? this._error = true : false;
						}

					}

					if (this._error) {

						console.log("\x1B[91mWARNING\x1B[0m: " + new Date().toUTCString() + " All orders weren't cancelled properly log " +
							"in the plateform and manually close them");
						process.exit()

					} else {
						console.log("\x1B[1mFINISH\x1B[0m: " + new Date().toUTCString() + " all orders have succefully been cancelled. Thanks for using me :)")
						process.exit();

					}
				}
				
			},12000)

		})

		process.on("unhandledRejection", async (err) => {

			/**
			 * Similar to what's above.
			 */

			this._kill = true;

			this._exception++;

			console.log("\x1B[91;1mERROR\x1B[0m:" + new Date().toUTCString() + " the error which stopped the program : ", err);

			if (this._exception > 1) {

				console.log("\x1B[91;1mFATAL ERROR: " + new Date().toUTCString() + " An error occured during error handling, process got killed, please check right now " +
					"the exchange to close any remaining order\x1B[0m");
				process.exit();

			}

			setTimeout(async () => {

				console.log("LOG: " + new Date().toUTCString() + " trying to cancel all orders at once with cancelOnce method");

				if (await this.cancelOnce()) {

					console.log("\x1B[1mFINISH\x1B[0m: " + new Date().toUTCString() + " all orders have succefully been cancelled. Thanks for using me :)")

					process.exit();

				} else {

					console.log("\x1B[38;5;226mNOTICE\x1B[0m: " + new Date().toUTCString() + " CancelOnce method returned false and didn't worked properly" +
						" starting to cancel every pair one at a time");

					for(var pair in this._spec){

						if(!this._spec[pair]["created"]) continue;

						if(!await this.cancelAllOrders(pair)){

							console.log("LOG: " + new Date().toUTCString() + " start using cancelAllOrders on " + pair);

							var error = await this.timerCancelAll(pair);

							!error ? this._error = true : false;

						}

					}

					if (this._error) {

						console.log("\x1B[91mWARNING\x1B[0m: " + new Date().toUTCString() + " All orders weren't cancelled properly log " +
							"in the plateform and manually close them");
						process.exit()

					} else {
						console.log("\x1B[1mFINISH\x1B[0m: " + new Date().toUTCString() + " all orders have succefully been cancelled. Thanks for using me :)")
						process.exit();

					}
				}
				
			},12000)

		})

		process.stdin.resume();

		/**
		 * this section allows us to use
		 * a "secret" api call in order to close
		 * all the orders at once.
		 */

		process.stdin.on("data", async (data) => {

			data = data.toString().replace("\n","").replace("\r","");

			if (data.includes("->")) {

				data = data.split("->");

				if (data[0] == "open") {

					var json = JSON.parse(data[1]);

					await this.getWallet(1);

					for (var pair in json){

						if (!this._spec[pair]) {

							this._spec[pair] = json[pair];
							await this.createSocket(pair);
							this._interval["pair"].push(pair);

						}
					}


				} else if (data[0] == "close") {

					clearInterval(this._spec[data[1]]['pong']);
					clearInterval(this._spec[data[1]]['timer']);
					this._spec[data[1]]['socket'].removeAllListeners("data").removeAllListeners("error");
					await this.cancelAllOrders(data[1]);
					delete this._spec[data[1]];
					console.log("LOG: " + new Date().toUTCString() + " orders cancelled on " + data[1]);

				}

			} else {

				this._cookie = data;

			}

		});

		setInterval(async() => {

			await this.getWallet(1);

		},300000);

		/**
		 * this interval is used in order 
		 * to keep our calls below 1000 calls/minute 
		 */

		setInterval(async() => {

			this._callcounter -= 15;
			this._callcounter < 0 ? this._callcounter = 0 : false;

		},900)

		setInterval(async () => {

			if (this._interval["pair"].length && this._interval["lock"]) {

				var champ = this._interval["side"] ? "asks" : "bids";

				this._interval["lock"] = false;
				await this.checkOne(this._interval["pair"][this._interval["index"]],this._interval["side"]);
				this._interval["side"] = !this._interval["side"];
				this._interval["side"] ? this._interval["index"]++ : false;
				this._interval["index"] = this._interval["index"] >= this._interval["pair"].length ? 0 : this._interval["index"];
				this._interval["lock"] = true;

			}

		},20000)

		/**
		 * Populates our wallet 
		 * and make the rest of the 
		 * function asychronously 
		 */

		this.getWallet().then(async(value) => {

			await this.getExchangeInfo();

			for(var pair in this._spec){

				await this.createSocket(pair);
				this._interval["pair"].push(pair);

			}

			this._start = true;

		})

	}

	/**
	 * @param ref <Int>
	 *
	 * this function is used if _cookie
	 * was provided to cancel all the orders 
	 * at once
	 */

	async cancelOnce(ref = 0){

		if (!this._cookie) {

			console.log("\x1B[38;5;226mNOTICE\x1B[0m: " + new Date().toUTCString() + " _cookie variable is set to false, " +
			 "can't use cancelOnce method returning false");

			return false;

		} else {

			return new Promise((resolve,reject) => {

					var $response = '';

					var socket = $tls.connect(443,"coss.io", async () => {

						socket.end("DELETE /c/order/cancel_all HTTP/1.1\r\n"+
							"Host: coss.io\r\n" +
							"Cookie: " + this._cookie + "\r\n\r\n");
						});

					socket.on("data", async (chunk) => {$response += chunk.toString(); });

					socket.on("end", async () => {

						if ($response.includes("302 Found") || $response.includes("<html>")) {

							resolve(false);

						} else {

							resolve(true);
						}

					});

					socket.on("error", async (err) => {

						console.log("\x1B[91mNOTICE\x1B[0m: " + new Date().toUTCString() + " an error occured during CancelOnce method err : " + err);

						resolve(false);

					})

			})

		}

	}

	/**
	 * @param pair <String>
	 *
	 * this function return the list
	 * of the open orders for the given pair
	 */

	async getOpenOrders($pair,ref = 0){

		this._callcounter++;

		return new Promise(async (resolve,reject) => {

				var $date =  new Date().getTime() - 3000;

				var $response = "";

				var $data = '{"symbol": '+ $pair +',"timestamp": '+ $date +',"recvWindow": 5000}';

				var hmac = $crypto.createHmac("sha256",$private);
				hmac.update($data);

				var options = {

					"hostname": "trade.coss.io",
					"port": 443,
					"path": "/c/api/v1/order/list/open",
					"method": "POST",
					"headers": {

						"Host": "trade.coss.io",
						"Content-Type": "application/json",
						"Content-Length": $data.length,
						"Authorization": $public,
						"Signature": hmac.digest("hex")
					}

				}

				var req = $https.request(options, async (res) => {

					res.on("data", async (chunk) => {$response += chunk.toString(); });

					res.on("end", async () => {

						try{

							$response = JSON.parse($response);

							if (!$response["list"]) {

								throw new Error("unexpected response");

							}

							$response = $response["list"].map(async(value) => {

								return value["order_id"];

							})

							$response = await Promise.all($response);

							console.log("LOG: " + new Date().toUTCString() + " list of open orders OK ");

							resolve($response);

						} catch(e){

							var wait = Math.round(Math.random() * 800 + 600)

							var timer = setTimeout(async () => {

								console.log("\x1B[38;5;226mNOTICE\x1B[0m: " + new Date().toUTCString() + " something caused an error while getting " +
								" open orders on: " + pair + " trying to get the list again, Error: " + e);

								resolve(await this.getOpenOrders($pair, ++ref));

							},wait);

							if (ref > 4) {

								console.log("\x1B[91mWARNING\x1B[0m: " + new Date().toUTCString() + "maximum number of try reached on " + pair +
								" orders wont be claused please close them manually. Error" + e);

								clearTimeout(timer);
								resolve(false);

							}

						}

					});

				})


				req.on("error", async(e) => {

					var wait = Math.round(Math.random() * 800 + 600)

					if (ref > 4) {

						console.log("\x1B[91mWARNING\x1B[0m: " + new Date().toUTCString() + "maximum number of try reached on " + pair +
								" orders wont be claused please close them manually. Error" + e);
						resolve(false)

					}

					setTimeout(async () => {

						console.log("\x1B[91mWARNING\x1B[0m: " + new Date().toUTCString() + " an error occured on " + pair +
								" while getting the list of open orders. Error: " + e);

						resolve(await this.getOpenOrders($pair, ++ref));

					},wait);

				});

				req.end($data);

		});

	}

	/**
	 * @param pair <String>
	 *
	 * this is the main function for
	 * cancelling all the orders for the given
	 * pair, it uses several sub-functions.
	 */

	async cancelAllOrders(pair){

		return new Promise(async(resolve,reject) =>{

			console.log("LOG: " + new Date().toUTCString() + " in cancelAllOrders waiting for getOpenOrders on pair: " + pair);

			var liste = await this.getOpenOrders(pair);

			if (!liste) {

				this._error = true;
				resolve(false)
			}

			if (this._callcounter + liste.length < 700) {

				console.log("LOG: " + new Date().toUTCString() + " Ok for our API limit calls requests ");

				for(var x of liste){

					await this.cancelOne(x,pair);

				}

				resolve(true);

			} else {

				console.log("\x1B[38;5;226mNOTICE\x1B[0m: " + new Date().toUTCString() + " broke our API limit requests waiting for 1 minute ");

				resolve(false);

			}

		})


	}

	/**
	 * @param pair <String>
	 *
	 * this function waits for one minute before 
	 * starting to cancel new orders.
	 */

	async timerCancelAll(pair){

		return new Promise((resolve,reject) => {

			setTimeout(async() => {
				console.log("LOG: " + new Date().toUTCString() + "timer of 1 minute elapsed " + pair);
				await this.cancelAllOrders(pair);
				resolve(true);

			},65000)

		})

	}

	/**
	 * @param id <String> the id of the pair 
	 * @param pair <String> 
	 */

	async cancelOne(id,pair,ref = 0){

		this._callcounter++;

		return new Promise(async (resolve,reject) => {

			var $response = "";

			var $date =  new Date().getTime() - 3000;

			var $data = '{"order_symbol": '+ pair +',"timestamp": '+ $date +',"recvWindow": 5000,"order_id": ' + id + '}';


			var hmac = $crypto.createHmac("sha256",$private);
			hmac.update($data);

			var options = {

				"hostname": "trade.coss.io",
				"method": "DELETE",
				"port": 443,
				"path": "/c/api/v1/order/cancel",
				"headers": {

					"Content-Type": "application/json",
					"Content-Length": $data.length,
					"Authorization": $public,
					"Signature": hmac.digest("hex")
				}
			}

			var req = $https.request(options,async(res) => {

				res.on("data", async (chunk) => {$response += chunk.toString(); });

				res.on("end", async () => {

					try{

						$response = JSON.parse($response);

						if (!$response["order_id"]) {

							throw new Error("unexpected response");

						} else {

							resolve($response);

						}

					} catch(e){

						var wait = Math.round(Math.random() * 800 + 600)

						var timer = setTimeout(async () => {

							console.log("\x1B[38;5;226mNOTICE\x1B[0m: " + new Date().toUTCString() + " an order cancelling went wrong, retrying on: " +
							 pair + " if no warning follows this message the order got cancelled " + ". Error: " + e);

							resolve(await this.cancelOne(id,pair, ++ref));

						},wait);

						if (ref > 4) { 

							console.log("\x1B[91mWARNING\x1B[0m: " + new Date().toUTCString() + " an order didn't got cancelled please  " +
							" cancel it manually on the exchange on " + pair + ". Error: " + e);
							this._error = true;
							clearTimeout(timer);
							resolve(false);
						}

					}

				});

			});

			req.on("error", async(e) => {

				var wait = Math.round(Math.random() * 800 + 600)

				if (ref > 4) {
					console.log("\x1B[91mWARNING\x1B[0m: " + new Date().toUTCString() + " an order didn't got cancelled please  " +
						" cancel it manually on the exchange on " + pair + ". Error: " + e);
					resolve(false)
				}

				setTimeout(async () => {

					console.log("\x1B[91mWARNING\x1B[0m: " + new Date().toUTCString() + " an error occured during the request  " +
							" for cancelling an order on " + pair + ". Error: " + e);

					resolve(await this.cancelOne(id,pair, ++ref));

				},wait);

			});

			req.end($data);

		})

	}

	/**
	 * @params Ø
	 * 
	 * @return Promise
	 *
	 * This function returns our wallet
	 * and stores the results in the _wallet variable
	 */

	async getWallet(ref = 0){

		console.log("LOG: " + new Date().toUTCString() + " getting our wallet ");

		return new Promise((resolve,reject) => {

			var $time = new Date().getTime() - 3000;

			var hmac = $crypto.createHmac("sha256",$private)

			var $payload = "recvWindow=5000&timestamp=" + $time;

			hmac.update($payload);

			var options = {
				host: "trade.coss.io",
				path: "/c/api/v1/account/balances?" + $payload,
				headers: {
					"Host": "trade.coss.io",
					"Authorization": $public,
					"Signature": hmac.digest("hex")
				}
			}

			$https.get(options,async (res) => {
				var $data = "";

				res.on("data", async (chunk) => {
					$data += chunk.toString();
				});

				res.on("end", async () => {

					try{

						let data = JSON.parse($data);

						data.forEach((value) => {
							this._wallet[value['currency_code']] = parseFloat(value['available']);
						});

						console.log("LOG: " + new Date().toUTCString() + " succeed getting wallet ");

						resolve(true);

					} catch(err){

						if (ref == 0) {

							console.log("\x1B[91;1mFATAL ERROR: " + new Date().toUTCString() + " An error occured while getting the wallet amounts " +
							"this cant allow us to continue exiting\x1B[0m ", err);
							process.exit();

						} else {

							console.log("\x1B[91mWARNING\x1B[0m: " + new Date().toUTCString() + " Unable to retrive Wallet informations try again");
							resolve(true);

						}

					}
				});

				res.on("error", async err => {

					if (ref == 0) {

						console.log("\x1B[91;1mFATAL ERROR: " + new Date().toUTCString() + " An error occured while getting the wallet amounts " +
						"this cant allow us to continue exiting\x1B[0m ", err);
						process.exit();

					} else {

						console.log("\x1B[91mWARNING\x1B[0m: " + new Date().toUTCString() + " Unable to retrive Wallet informations try again");
						resolve(true);

					}

				})
			});
		});

	}

	/**
	 * @params none
	 *
	 * This function is used to retrieve
	 * infomations about the pairs on the 
	 * exchange
	 *
	 * @return Promise
	 */

	async getExchangeInfo(){
	 	
		return new Promise((resolve,rej) => {
			$https.get("https://trade.coss.io/c/api/v1/exchange-info", (res) => {
				let data = "";

				res.on("data", (chunk) => {
					data += chunk;
				});

				res.on("end", () => {

					try{
						data = JSON.parse(data);

						data['base_currencies'].forEach((value) => {
							this._amount_min.set(value['currency_code'],value['minimum_total_order']);
						});

						data['symbols'].forEach((value) => {
							this._decimal.set(value['symbol'],{amount_decimal: value['amount_limit_decimal'],price_decimal: value['price_limit_decimal']});
						});

						resolve(true);

					}catch (err){

						console.log("\x1B[91;1mFATAL ERROR: " + new Date().toUTCString() + " An error occured while getting exchange specification " +
							"this cant allow us to continue, exiting\x1B[0m ", err);
						process.exit();

					}

				});

				res.on("error", async err =>{

					console.log("\x1B[91;1mFATAL ERROR: " + new Date().toUTCString() + " An error occured while getting exchange specification " +
							"this can't allow us to continue, exiting\x1B[0m ", err);
					process.exit();

				})

			});
		}); 	

	}

	/**
	 * @param $pair <string> 
	 *
	 * Creates a new connection on a specified
	 * websocket on the exchange
	 * in order to listen for data and update our 
	 * internal orderbook
	 */

	async createSocket($pair,ref = 0){

		if (!this._spec[$pair]["created"]) {

			this._spec[$pair]["poll"] = [];
			this._spec[$pair]["a_id"] = {};
 			this._spec[$pair]["b_id"] = {};
 			this._spec[$pair]["a_time"] = {};
 			this._spec[$pair]["b_time"] = {};

 			/**
			 * thoses are variables used if we set overflow
			 * to false and reach our order price bourdary
			 */

			this._spec[$pair]["reminder_asks"] = false;
			this._spec[$pair]["reminder_bids"] = false;

		}

		this._spec[$pair]["lock"] = true;

		if(this._kill) return true;

		this._spec[$pair]["events"] = new $events;

		this._spec[$pair]["events"].once("finish", async() => {

			var list = Array.from(this._spec[$pair]["poll"]);
			this._spec[$pair]["poll"] = [];

			await this.updateStripes(list,$pair);

		})

		this._spec[$pair]["created"] = false;

		this._spec[$pair]['pong'] = 0;

		this._spec[$pair]['timer'] = 0;

		if(!this._decimal.has($pair)){

			console.log("\x1B[91mWARNING\x1B[0m: " + new Date().toUTCString() + " " + $pair + " doesnt exists");
			resolve(false);

		}

		console.log("LOG: " + new Date().toUTCString() + " opening socket on " + $pair);

		return new Promise((resolve,reject) => {

			this._spec[$pair]['socket'] = $tls.connect(443,"engine.coss.io", async ()=>{

				this._spec[$pair]['socket'].write("GET /ws/v1/dp/" + $pair +" HTTP/1.1\r\n" +
				"Host: engine.coss.io\r\n" +
				"Accept: */*\r\nConnection: Upgrade\r\n" +
				"Upgrade: websocket\r\nSec-WebSocket-Version: 13\r\n" +
				"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n");

				/**
				 * If we receive a wrong response we reopen 
				 * a new socket on this pair until the connection 
				 * is ready.
				 */

				this._spec[$pair]['socket'].once("data",async (data) => {

					if(this._kill) return true;

					if (data.toString().indexOf("101") != -1) {

						console.log("LOG: " + new Date().toUTCString() + " connected on : " + $pair);

						/** 
						 * Pong frames according to RFC 6455
						 */

						this._spec[$pair]['pong'] = setInterval(() => {
							this._spec[$pair]["socket"].write(Buffer.from([0x8A,0x80,0x77,0x77,0x77,0x77]));
						},20000);

						this._spec[$pair]['timer'] = setInterval(async() => {

							if (this._spec[$pair]["created"] && this._spec[$pair]["lock"] && this._spec[$pair]["poll"].length) {

								var tempo = Array.from(this._spec[$pair]["poll"]);
								this._spec[$pair]["poll"] = [];

								await this.updateStripes(tempo,$pair);

							}

						},250)

						/**
						 * Before listening to the data
						 * we have to create the order book in 
						 * order to prevent missing any data frame 
						 * from the websocket.
						 */
						var $ob = await this.createOrderbook($pair);

						/**
						 * If we failed to open the order book 
						 * we do not do any further actions
						 * because this would result in errors
						 */

						if (!$ob) {

							console.log("\x1B[38;5;226mNOTICE\x1B[0m: " + new Date().toUTCString() + " no orders will be opened on " + $pair +
								" cause a problem occured while creating order book");
							clearInterval(this._spec[$pair]['pong']);
							clearInterval(this._spec[$pair]['timer']);
							this._spec[$pair]['socket'].removeAllListeners("data").removeAllListeners("error");
							resolve(false);

						}

						/**
						 * Once We've created our order book and our socket is 
						 * connected we add our 
						 * orders for the market making. If the orders have already been
						 * created created would be set to true so it would be useless to create stripes
						 * once again.
						 */

						var response = this._spec[$pair]["created"] ? false : await this.createStripes($pair);

						console.log("LOG: " + new Date().toUTCString() + " stripes created on: " + $pair);

						this._spec[$pair]["events"].emit("finish");
						this._spec[$pair]["created"] = true;
						resolve(response);

					} else {

						console.log("\x1B[38;5;226mNOTICE\x1B[0m: " + new Date().toUTCString() + " trying to open socket again on : " + $pair);

						this.createSocket($pair).then((value) => {
							resolve(value);
						});
					}
					
				})

				/**
				 * If an error occurs on our websocket
				 * we just reopen it. But we need to clear 
				 * every thing before.
				 */

				this._spec[$pair]['socket'].on("error", async (err) => {

					if (ref > 3) {

						console.log("\x1B[91mWARNING\x1B[0m: " + new Date().toUTCString() + " too many errors on "+ $pair +
							" socket we will disable it. [Error] : " + err);
						clearInterval(this._spec[$pair]['pong']);
						clearInterval(this._spec[$pair]['timer']);
						this._spec[$pair]['socket'].removeAllListeners("data").removeAllListeners("error");

					} else {

						console.log("\x1B[91mWARNING\x1B[0m: " + new Date().toUTCString() + " an error occured on socket "+ $pair +" we will try "+
							"we will try to open it again error : " + err);
						clearInterval(this._spec[$pair]['pong']);
						clearInterval(this._spec[$pair]['timer']);
						this._spec[$pair]['socket'].removeAllListeners("data").removeAllListeners("error");
						await this.createSocket($pair,++ref);

					}

				})

				this._spec[$pair]['socket'].on("data",async (data) => {


					if (this._kill) { return false}

					/**
					 * We parse our data and update our orderbooks
					 */

					var $data = await this.parseData(data);


					if ($data) {

							for(var x of $data){

								if (x["a"].length) {

									console.log("LOG: " + new Date().toUTCString() + " data received on " + $pair + " asks[price]: " + x['a'][0] +
									" asks[quantity]: " + x['a'][1] + " frame timestamp: " + x['t']);

								} else if (x["b"].length) {

									console.log("LOG: " + new Date().toUTCString() + " data received on " + $pair + " bids[price]: " + x['b'][0] +
									" bids[quantity]: " + x['b'][1] + " frame timestamp: " + x['t']);

								}

								if (x["a"][1] == 0) {

									this._spec[$pair]["poll"].push(x);

								} else if (x["b"][1] == 0) {

									this._spec[$pair]["poll"].push(x);

								} else if (this._spec[$pair]["orderbook"]["asks"].includes(parseFloat(x["a"][0]))) {

									await this.checkTest($pair,parseFloat(x["a"][0]),"a_id")

								} else if (this._spec[$pair]["orderbook"]["bids"].includes(parseFloat(x["b"][0]))) {

									await this.checkTest($pair,parseFloat(x["b"][0]),"b_id")

								}

							}

					}

				});

			});
		});

	}

	/**
	 * @param pair <String>
	 * @param ref <Int>
	 * @return Promise
	 * 
	 * this function creates and store the order book for the 
	 * specified pair, the ref variable is used to count if 
	 * too much calls fail the opening on the pair is aborted
	 */

	async createOrderbook(pair,ref = 0){

		this._callcounter++;

		if (this._kill) { return false}

		return new Promise((resolve,rej) => {
			$https.get("https://engine.coss.io/api/v1/dp?symbol="+pair, (res) => {
				var donnes = "";

				res.on("data",async (chunk) => {
					donnes += chunk;
				});

				res.on("end",async () => {

					try {

						donnes = JSON.parse(donnes);

						$assert.ok(donnes["asks"] && donnes["bids"],"We must have at least one bid and one ask on the order book");

						this._ob_list[pair] = donnes;

						console.log("LOG: " + new Date().toUTCString() + " orderbook created on " + pair);

						resolve(donnes);

					} catch(e){

						ref > 3 ? resolve(false): false;
						setTimeout(async() => {

							console.log("\x1B[38;5;226mNOTICE\x1B[0m: " + new Date().toUTCString() + " trying to open orderbook again on: " + pair +
								" the error we caught: " + err);

							resolve(await this.createOrderbook(pair,++ref))

						},750);

					}
					
				});
			}).on("error", async err => {

				ref > 3 ? resolve(false): false;
				setTimeout(async() => {

					console.log("\x1B[91mWARNING\x1B[0m: " + new Date().toUTCString() + " trying to open orderbook again on: " + pair +
						" the error we caught: " + err);

					resolve(await this.createOrderbook(pair,++ref));

				},750);

			});
		});

	}

	/**
	 * @param data <String>
	 *
	 * Get the raw data as input and returns 
	 * a Promise containing the data in JSON
	 */

	async parseData(data){
		if (data.length > 50 && data.indexOf("Server") == -1) {
			data = data.toString("ascii").match(/\{.+?\}/g);

			var $data = data.map(async (value) => {
				return JSON.parse(value.replace("[[","[").replace("]]","]"));
			});
			return Promise.all($data);
		} else {
			return false;
		}
	}

	/**
	 * @params data <array> A Json array containing the formatted 
	 * data to analyse
	 *
	 * @params pair <string> The pair corresponding to those data
	 *
	 * Check the data that are received if a quantity is set to 0 
	 * we check if this quantity were part of our stripes
	 * if it is the case we have to update our stripes
	 */	

	async updateStripes(valuee,pair){

		this._spec[pair]["lock"] = false;
		var $pairs = pair.split("_");
		var final = [];
		var changes = false;

		/**
		 * Once we receive data, we check 
		 * every frame from the websocket 
		 * to check if we received data 
		 * that includes orders that we have 
		 * opened.
		 */

		for(var data of valuee){

			changes = false;

			if (data['a'].length) {

				/**
				 * if the data is about an ask order 
				 * that we receive, we check if this a 0 quantity
				 * update which could mean some orders have been bought.
				 */

				if (data['a'][1] == 0 && this._spec[pair]["orderbook"]["asks"].includes(parseFloat(data['a'][0]))) {

					for (var val of this._spec[pair]["orderbook"]["asks"]){

						/**
						 * if we receive a 0 quantity data update, we have to check 
						 * weather we have an order at such price, if this is the case,
						 * this means an order have been excecuted.
						 */

						if (data['a'][0] == val && parseFloat(data['t']) >= this._spec[pair]["a_time"][parseFloat(val)]) {

							console.log("LOG: " + new Date().toUTCString() + " usefull data received on " + pair + " asks[price]: " + data['a'][0] +
							" asks[quantity]: " + data['a'][1] + " frame timestamp: " + data['t']);

							/**
							 * if one of our asks order has been excuted we have
							 * to rise our best bid order in order to still cover the
							 * order book. so we calculate our new bid by multiply our highest
							 * bid by the profit we want to take.
							 */

							changes = true;

							var price = this._spec[pair]["orderbook"]["bids"][0] *
							(this._spec[pair]["profit"] / 100 + 1);

							var price_ceil = await this._ceil(price,this._decimal.get(pair)["price_decimal"]);

							price = val / price_ceil >= (this._spec[pair]["profit"] / 100 + 1) ? price_ceil : await this._floor(price,this._decimal.get(pair)["price_decimal"]);

							while (val / price < (this._spec[pair]["profit"] / 100 + 1)) {

								price = (price * 10 ** this._decimal.get(pair)["price_decimal"] - 1) / 10 ** this._decimal.get(pair)["price_decimal"];

							}

							/**
							 * we get the quantity that we should put for this new order.
							 */

							var amount = await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],price,pair);

							if (this._spec[pair]["allow_overflow"]) {

								/**
								 * In the case we allowed overflowding, we keep 
								 * the same number of order opened at each time,
								 * so if one order got excecuted we have to add one 
								 * above our highest ask in this case, see docs for more details.
								 * spec [];
								 */

								/**
								 * what ever happens if we have one order exceuted 
								 * we have to update our wallet.
								 */

								if (this._spec[pair]["orderbook"]["asks"].length <= 1) {

									/** 
									 * if we are over our range limit we just update our wallet
									 * but nothing else.
									 */

									if (!this._spec[pair]["reminder_asks"]) {

										this._wallet[$pairs[1]] += await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],val,pair) * val;

									}

										this._spec[pair]["reminder_asks"] = val

								} else {

									/**
									 * if we are in the range we specified, we get the quantity and 
									 * the price of the order we want to open and we open it.
									 */

									this._wallet[$pairs[1]] += await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],val,pair) * val;

									this._spec[pair]["orderbook"]["asks"].splice(this._spec[pair]["orderbook"]["asks"].indexOf(val),1);

									delete this._spec[pair]["a_time"][parseFloat(val)];
									delete this._spec[pair]["a_id"][parseFloat(val)];

									if(!this._spec[pair]["orderbook"]["bids"].includes(price) && this._spec[pair]["orderbook"]["asks"][0] / price >= (this._spec[pair]["profit"] / 100 * 2 + 1) && await this.openOrder(price,amount,"BUY",pair)) this._spec[pair]["orderbook"]["bids"].unshift(price);

								}


								if (this._spec[pair]["orderbook"]["asks"].length <= this._spec[pair]["orderbook"]["asks_length"] && this._spec[pair]["orderbook"]["asks"].length > 1) {

									/**
									 * we only want to have the same number of order as the moment
									 * we set up our stripes, so if we have enough opened orders
									 * it is not necessary to open more orders.
									 */

									/**
									 * price_new, give us our new highest ask in order to still cover all the order book.
									 */

									var price_new = await this._ceil(this._spec[pair]["orderbook"]["asks"][this._spec[pair]["orderbook"]["asks"].length - 1] *
										(this._spec[pair]["profit"] / 100 + 1),this._decimal.get(pair)["price_decimal"]); 

									var amount_new = await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],price_new,pair);

									if(await this.openOrder(price_new,amount_new,"SELL",pair)) this._spec[pair]["orderbook"]["asks"].push(price_new);

								}

								break;

							} else {

								/**
								 * in the case we don't allow overfloating, we dont want to open
								 * more orders, we just want to cover the range we gave to the 
								 * algorythm.
								 */

								if (this._spec[pair]["orderbook"]["asks"].length <= 1) {

									/** 
									 * if we are over our range limit we just update our wallet
									 * but nothing else.
									 */

									if (!this._spec[pair]["reminder_asks"]) {

										this._wallet[$pairs[1]] += await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],val,pair) * val;

									}

									this._spec[pair]["reminder_asks"] = val
									break;

								} else {

									/**
									 * if we are in the range we specified, we get the quantity and 
									 * the price of the order we want to open and we open it.
									 */

									this._wallet[$pairs[1]] += await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],val,pair) * val;

									delete this._spec[pair]["a_time"][parseFloat(val)];
									delete this._spec[pair]["a_id"][parseFloat(val)];

									this._spec[pair]["orderbook"]["asks"].splice(this._spec[pair]["orderbook"]["asks"].indexOf(val),1);

									if(!this._spec[pair]["orderbook"]["bids"].includes(price) && this._spec[pair]["orderbook"]["asks"][0] / price >= (this._spec[pair]["profit"] / 100 * 2 + 1) && await this.openOrder(price,amount,"BUY",pair)) this._spec[pair]["orderbook"]["bids"].unshift(price);

									break;

								}

							}							

						}

					}

				}

				/**
				 * the below for loop, will most of the time,
				 * remain usefull, however, in really rare occasion,
				 * it will keep your orders on track, especially 
				 * when we receive multiples frames in a really short 
				 * period of time, or if we get the frames in the wrong order
				 * but this should not happen, according to the TCP
				 * protocol.
				 */

				if (changes && this._spec[pair]["force_liquidity"]) {

					await this.updateWhileAsk(pair,data);

				}

				if (changes == true) {

					console.log("LOG: " + new Date().toUTCString() + " pair: ",pair," order asks",this._spec[pair]["orderbook"]["asks"]);
					console.log("LOG: " + new Date().toUTCString() + " pair: ",pair," order bids",this._spec[pair]["orderbook"]["bids"]);
					console.log("LOG: " + new Date().toUTCString() + " wallet on " + $pairs[0] + ": ",this._wallet[$pairs[0]]);
					console.log("LOG: " + new Date().toUTCString() + " wallet on " + $pairs[1] + ": ",this._wallet[$pairs[1]]);


				}

			} else if (data['b'].length) {

				if (data['b'][1] == 0 && this._spec[pair]["orderbook"]["bids"].includes(parseFloat(data['b'][0]))) {

					for(var valeur of this._spec[pair]["orderbook"]["bids"]){

						if (data['b'][0] == valeur && parseFloat(data['t']) >= this._spec[pair]["b_time"][parseFloat(valeur)]) {

							console.log("LOG: " + new Date().toUTCString() + " usefull data received on " + pair + " bids[price]: " + data['b'][0] +
							" bids[quantity]: " + data['b'][1] + " frame timestamp: " + data['t']);

							changes = true;

							var price = this._spec[pair]["orderbook"]["asks"][0] /
							   (this._spec[pair]["profit"] / 100 + 1);

							var price_floor = await this._floor(price,this._decimal.get(pair)["price_decimal"]);

							price = price_floor / valeur >= (this._spec[pair]["profit"] / 100 + 1) ? price_floor : await this._ceil(price,this._decimal.get(pair)["price_decimal"]);

							while (price / valeur < (this._spec[pair]["profit"] / 100 + 1)) {

								price = (price * 10 ** this._decimal.get(pair)["price_decimal"] + 1) / 10 ** this._decimal.get(pair)["price_decimal"];

							}

							var amount = await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],price,pair);

							if (this._spec[pair]["allow_overflow"]) {

								if (this._spec[pair]["orderbook"]["bids"].length <= 1) {

									if (!this._spec[pair]["reminder_bids"]) {

										this._wallet[$pairs[0]] += await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],valeur,pair);

									}
								
									this._spec[pair]["reminder_bids"] = valeur

								} else {

									this._wallet[$pairs[0]] += await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],valeur,pair);

									this._spec[pair]["orderbook"]["bids"].splice(this._spec[pair]["orderbook"]["bids"].indexOf(valeur),1);

									delete this._spec[pair]["b_time"][parseFloat(valeur)];
									delete this._spec[pair]["b_id"][parseFloat(val)];

									if(!this._spec[pair]["orderbook"]["asks"].includes(price) && price / this._spec[pair]["orderbook"]["bids"][0] >= (this._spec[pair]["profit"] / 100 * 2 + 1) && await this.openOrder(price,amount,"SELL",pair))this._spec[pair]["orderbook"]["asks"].unshift(price);

								}

								if (this._spec[pair]["orderbook"]["bids"].length <= this._spec[pair]["orderbook"]["bids_length"] && this._spec[pair]["orderbook"]["bids"].length > 1) {

									var price_new = await this._floor(this._spec[pair]["orderbook"]["bids"][this._spec[pair]["orderbook"]["bids"].length - 1] /
										(this._spec[pair]["profit"] / 100 + 1),this._decimal.get(pair)["price_decimal"]);

									var amount_new = await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],price_new,pair);

									if(await this.openOrder(price_new,amount_new,"BUY",pair))this._spec[pair]["orderbook"]["bids"].push(price_new);

								}

								break;

							} else {

								if (this._spec[pair]["orderbook"]["bids"].length <= 1) {

									if (!this._spec[pair]["reminder_bids"]) {

										this._wallet[$pairs[0]] += await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],valeur,pair);

									}

									this._spec[pair]["reminder_bids"] = valeur;
									break;

								} else {

									this._wallet[$pairs[0]] += await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],valeur,pair);

									this._spec[pair]["orderbook"]["bids"].splice(this._spec[pair]["orderbook"]["bids"].indexOf(valeur),1);

									delete this._spec[pair]["b_time"][parseFloat(valeur)];
									delete this._spec[pair]["b_id"][parseFloat(val)];

									if(!this._spec[pair]["orderbook"]["asks"].includes(price) && price / this._spec[pair]["orderbook"]["bids"][0] >= (this._spec[pair]["profit"] / 100 * 2 + 1) && await this.openOrder(price,amount,"SELL",pair))this._spec[pair]["orderbook"]["asks"].unshift(price);

									break;

								}

							}
							
						}

					}

				}


				if (changes && this._spec[pair]["force_liquidity"]) {

					await this.updateWhileBid(pair,data);

				}

				if (changes == true) {

					console.log("LOG: " + new Date().toUTCString() + " pair: ",pair," order asks",this._spec[pair]["orderbook"]["asks"]);
					console.log("LOG: " + new Date().toUTCString() + " pair: ",pair," order bids",this._spec[pair]["orderbook"]["bids"]);
					console.log("LOG: " + new Date().toUTCString() + " wallet on " + $pairs[0] + ": ",this._wallet[$pairs[0]]);
					console.log("LOG: " + new Date().toUTCString() + " wallet on " + $pairs[1] + ": ",this._wallet[$pairs[1]]);

				}
			}
		}

		this._spec[pair]["lock"] = true;
		return true;

	}

	async updateSubAsks(data,pair,$pairs){

		return new Promise(async (resolve,reject) => {

			if (Math.max(...this._spec[pair]["orderbook"]["bids"]) < data['a'][0]) {

				resolve(false);

			} else {

				var final = [];

				for(var value of this._spec[pair]["orderbook"]["bids"]){

					/**
					 * if the frames specifies an ask that is 
					 * below our highest bid this mean we had 
					 * orders excecuted but we didn't got those frames.
					 * so we have to do a similar work as above.
					 */

					if (data['a'][0] <= value) {

						console.log("LOG: " + new Date().toUTCString() + " weird usefull data received on " + pair + " asks[price]: " + data['a'][0] +
							" asks[quantity]: " + data['a'][1]);

						/** 
						 * if the ask is below one of our 
						 * bids we have to open a new ask order.
						 * so we get the quantity and the price.
						 */


						var price = await this._floor(this._spec[pair]["orderbook"]["asks"][0] /
							(this._spec[pair]["profit"] / 100 + 1),this._decimal.get(pair)["price_decimal"]);

						var amount = await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],price,pair);

						if (this._spec[pair]["allow_overflow"]) {

							if (this._spec[pair]["orderbook"]["bids"].length <= 1) {

									if (!this._spec[pair]["reminder_bids"]) {
										this._wallet[$pairs[0]] += await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],value,pair);

									}
								
									this._spec[pair]["reminder_bids"] = value;
									final.push(value);

							} else {

									this._wallet[$pairs[0]] += await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],value,pair);

									if(await this.openOrder(price,amount,"SELL",pair))this._spec[pair]["orderbook"]["asks"].unshift(price);

							}

							var price_new = await this._ceil(this._spec[pair]["orderbook"]["bids"][this._spec[pair]["orderbook"]["bids"].length - 1] /
							(this._spec[pair]["profit"] / 100 + 1),this._decimal.get(pair)["price_decimal"]); 

							if (this._spec[pair]["orderbook"]["bids"].length <= this._spec[pair]["orderbook"]["bids_length"]) {

								var amount_new = await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],price_new,pair);

								if(await this.openOrder(price_new,amount_new,"BUY",pair))this._spec[pair]["orderbook"]["bids"].push(price_new);

							}

						} else {

							if (this._spec[pair]["orderbook"]["bids"].length <= 1) {

									if (!this._spec[pair]["reminder_bids"]) {

										this._wallet[$pairs[0]] += await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],value,pair);

									}
								
									this._spec[pair]["reminder_bids"] = value;
									final.push(value);

							} else {

									this._wallet[$pairs[0]] += await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],value,pair);

									if(await this.openOrder(price,amount,"SELL",pair))this._spec[pair]["orderbook"]["asks"].unshift(price);

							}

						}

					} else {

						final.push(value);

					}

				}

				this._spec[pair]["orderbook"]["bids"] = final;
				resolve(true);
			}

		})

	}

	async updateSubBids(data,pair,$pairs){

		return new Promise(async (resolve,reject) => {

			if (Math.min(...this._spec[pair]["orderbook"]["asks"]) > data['b'][0]) {

				resolve(false);

			} else {

				var final = [];

				for(var value of this._spec[pair]["orderbook"]["asks"]){


					if (data['b'][0] >= value) {


						var price = await this._ceil(this._spec[pair]["orderbook"]["bids"][0] *
							(this._spec[pair]["profit"] / 100 + 1),this._decimal.get(pair)["price_decimal"]);

						var amount = await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],price,pair);

						if (this._spec[pair]["allow_overflow"]) {

							if (this._spec[pair]["orderbook"]["asks"].length <= 1) {


									if (!this._spec[pair]["reminder_asks"]) {

										this._wallet[$pairs[1]] += await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],value,pair) * value;

									}
									final.push(value);
									this._spec[pair]["reminder_asks"] = value

							} else {

									this._wallet[$pairs[1]] += await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],value,pair) * value;

									if(await this.openOrder(price,amount,"BUY",pair))this._spec[pair]["orderbook"]["bids"].unshift(price);

							}

							var price_new = await this._ceil(this._spec[pair]["orderbook"]["asks"][this._spec[pair]["orderbook"]["asks"].length - 1] *
							(this._spec[pair]["profit"] / 100 + 1),this._decimal.get(pair)["price_decimal"]); // ceil

							if (this._spec[pair]["orderbook"]["asks"].length <= this._spec[pair]["orderbook"]["asks_length"]) {

								var amount_new = await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],price_new,pair);

								if(await this.openOrder(price_new,amount_new,"SELL",pair))this._spec[pair]["orderbook"]["asks"].push(price_new);

							}


						} else {

							if (this._spec[pair]["orderbook"]["asks"].length <= 1) {

									if (!this._spec[pair]["reminder_asks"]) {

										this._wallet[$pairs[1]] += await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],value,pair) * value;

									}
									final.push(value);
									this._spec[pair]["reminder_asks"] = value;

							} else {

									this._wallet[$pairs[1]] += await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],value,pair) * value;

									if(await this.openOrder(price,amount,"BUY",pair))this._spec[pair]["orderbook"]["bids"].unshift(price);

							}

						}

					} else {

						final.push(value);

					}

				}

				this._spec[pair]["orderbook"]["asks"] = final;
				resolve(true);

			}

		})
		
	}

	async updateWhileAsk(pair,data){

		while(this._spec[pair]["orderbook"]["asks"][0] / this._spec[pair]["orderbook"]["bids"][0] > (this._spec[pair]["profit"]*2/100 + 1)){

			var price = this._spec[pair]["orderbook"]["bids"][0] *
					(this._spec[pair]["profit"] / 100 + 1);

			var price_ceil = await this._ceil(price,this._decimal.get(pair)["price_decimal"]);

			var bask = await this._floor(this._spec[pair]["orderbook"]["asks"][0] / (this._spec[pair]["profit"]/100 + 1),this._decimal.get(pair)["price_decimal"]);

			price = this._spec[pair]["orderbook"]["asks"][0] / price_ceil < (this._spec[pair]["profit"]*2/100 + 1) || bask / price_ceil < (this._spec[pair]["profit"]/100 + 1) ? await this._floor(price,this._decimal.get(pair)["price_decimal"]) : price_ceil;

			if (this._spec[pair]["orderbook"]["asks"][0] / price <= (this._spec[pair]["profit"]*2/100 + 1)|| this._spec[pair]["orderbook"]["bids"].includes(price) || bask / price < (this._spec[pair]["profit"]/100 + 1)) {

				return true;

			}

			var amount = await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],price,pair);

			if(await this.openOrder(price,amount,"BUY",pair)){
				this._spec[pair]["orderbook"]["bids"].unshift(price);

			} else {

				return true;

			}

		}

		return true;

	}

	async updateWhileBid(pair,data){
		
		while(this._spec[pair]["orderbook"]["asks"][0] / this._spec[pair]["orderbook"]["bids"][0] > (this._spec[pair]["profit"]*2/100 + 1)){

			var price = this._spec[pair]["orderbook"]["asks"][0] /
					(this._spec[pair]["profit"] / 100 + 1);

			var price_floor = await this._floor(price,this._decimal.get(pair)["price_decimal"]);

			var bbid = await this._ceil(this._spec[pair]["orderbook"]["bids"][0] * (this._spec[pair]["profit"]/100 + 1),this._decimal.get(pair)["price_decimal"]);

			price = price_floor / this._spec[pair]["orderbook"]["bids"][0] < (this._spec[pair]["profit"]*2/100 + 1) || price_floor / bbid < (this._spec[pair]["profit"]/100 + 1) ? await this._ceil(price,this._decimal.get(pair)["price_decimal"]) : price_floor;

			var amount = await this.quantity(this._spec[pair]["amount"],this._spec[pair]["ref"],price,pair);

			if (price / this._spec[pair]["orderbook"]["bids"][0] <= (this._spec[pair]["profit"]*2/100 + 1) || this._spec[pair]["orderbook"]["asks"].includes(price) || price / bbid < (this._spec[pair]["profit"]/100 + 1)) {

				return true;

			}

			if(await this.openOrder(price,amount,"SELL",pair)){
				this._spec[pair]["orderbook"]["asks"].unshift(price);

			} else {

				return true;

			}

		}

		return true;

	}

	/**
	 * @param <pair> the pair on which 
	 * we want to make market making
	 *
	 * this function determines through several
	 * ways the best on to create our lower ask 
	 * and our lowest bid
	 */

	async createStripes($pair){

		var binance = {};

		var now = {"asks": parseFloat(this._ob_list[$pair]['asks'][0][0]), "bids": parseFloat(this._ob_list[$pair]["bids"][0][0])};

		var arb = {};


		return new Promise((resolve,reject) => {

			var twice = $pair.split("_");

			/**
			 * this tries to get the best bid 
			 * and the best ask from binance to compare to 
			 * coss in the case the spread is too wide
			 */

			$https.get("https://www.binance.com/api/v1/depth?limit=5&symbol=" + twice.join(""), async res => {

				let data = "";

				res.on("data", chunk => {data += chunk});

				res.on("end", async () => {

					try{

						data = JSON.parse(data);

					} catch(e){

						binance = false;

					}

					if (data["code"]) {

						binance = false;

					} else {

						/**
						 * Like binance and coss price precision are not the
						 * same we have to ajust to coss precision before doing 
						 * any work, not doing so would make us unable to open
						 * any order due to wrong price precision.
						 */

						binance["asks"] = await this._ceil(data["asks"][0][0],this._decimal.get($pair)["price_decimal"]);
						binance["bids"] = await this._floor(data["bids"][0][0],this._decimal.get($pair)["price_decimal"]);

					}

					/**
					 * Here we try to get some comparison point using 
					 * pseudo arbitrage. We compare to actual order book 
					 * prices.
					 */

					if (!(twice.includes("ETH") && twice.includes("BTC"))) {

						if (twice.includes("ETH")) {

							/**
							 * We use the ordenate function because 
							 * spliting pair to get arbitrage prices 
							 * can lead to differents situations 
							 * (eg: COSS_ETH => COSS_BTC and ETH_BTC
							 * COSS_BTC => COSS_ETH and ETH_BTC)
							 */

							arb = await this.ordenate("BTC",twice)

						} else {

							arb = await this.ordenate("ETH",twice);

						}

					} else {

						arb = false;

					}


					/**
					 * We can now set up our price for stripes.
					 */

					var response = await this.setStripes(now,arb,binance,$pair)

					resolve(response);

				});

			})

		})

	}

	async _floor($value,$decimals){

		return Math.floor($value * 10 ** $decimals) / 10 ** $decimals;

	}

	async _ceil($value,$decimals){

		return Math.ceil($value * 10 ** $decimals) / 10 ** $decimals;

	}

	async _round($value,$decimals){

		return Math.round($value * 10 ** $decimals) / 10 ** $decimals;

	}

	/**
	 * @params $pair1 <String>
	 *
	 * @params $pair1 <String>
	 *
	 * This function returns one pair 
	 * in the right order 
	 */

	async ordenatePair($pair1,$pair2){

		var order = [

			"USD",
			"EUR",
			"GBP",
			"TUSD",
			"GUSD",
			"USDC",
			"USDT",
			"DAI",
			"BTC",
			"ETH",
			"COSS",
			"XRP"

		];

		var one = order.indexOf($pair1);
		var two = order.indexOf($pair2);

		if (one == -1) return [$pair1,order[two]].join("_");
		if (two == -1) return [$pair2,order[one]].join("_");
		if (two < one) return [order[one],order[two]].join("_");
		if (two > one) return [order[two],order[one]].join("_");

	}

	/**
	 * @params $name <String>
	 *
	 * @params $tab <Array>
	 *
	 * This function the price using the 
	 * $tab variable to calculate arbitrages
	 */

	async ordenate($name,$tab){

		var $pair = $tab.join("_");

		var $pair1 = await this.ordenatePair($tab[0],$name);
		var $pair2 = await this.ordenatePair($tab[1],$name);

		if(!await this.createOrderbook($pair1)) return false;
		if(!await this.createOrderbook($pair2)) return false;

		if (!this._ob_list[$pair1]["bids"][0] || !this._ob_list[$pair1]["asks"][0]) {

			return false;

		} else {

			if ($pair2.split("_")[1] == $name) {

				var price_bids = await this._ceil(this._ob_list[$pair1]["bids"][0][0] /
				 this._ob_list[$pair2]["asks"][0][0],this._decimal.get($pair)["price_decimal"]);

				var price_asks = await this._floor(this._ob_list[$pair1]["asks"][0][0] /
				 this._ob_list[$pair2]["bids"][0][0],this._decimal.get($pair)["price_decimal"]);

				return {"asks": price_asks,"bids": price_bids}

			}

			if ($pair2.split("_")[0] == $name) {

				var price_bids = await this._ceil(this._ob_list[$pair1]["bids"][0][0] /
				 this._ob_list[$pair2]["bids"][0][0],this._decimal.get($pair)["price_decimal"]);

				var price_asks = await this._floor(this._ob_list[$pair1]["asks"][0][0] *
				 this._ob_list[$pair2]["asks"][0][0],this._decimal.get($pair)["price_decimal"]);

				return {"asks": price_asks,"bids": price_bids}

			}
		}

	}

	/**
	 * This function is usefull in order to
	 * split a bit our create stripe function
	 * if not the create stripe function be to
	 * big and not understandable.
	 */

	async setStripes(now,arb,binance,$pair){

		/**
		 * the dec variable is the price precision
		 */

		var dec = this._decimal.get($pair)["price_decimal"];

		var spread_int = now["asks"] * 10 ** dec - now["bids"] * 10 ** dec;

		/**
		 * There is a specific treatment if 
		 * the spread is below two price precision units
		 * eg price precision 0.001 price_asks => 10.002 price_bids => 10.000 : spread in units = 2 
		 */

		if (spread_int <= 2) {

			/**
			 * In the case the spread is exactly 
			 * one unit different between best bid and best ask
			 */

			if (spread_int == 1) {

				/**
				 * Now we check if the spread is wide enough
				 * to meet our profit criteria
				 */

				if (now["asks"]/now["bids"] >= this._spec[$pair]["profit"] * 2/100 + 1) {

					/**
					 * If we're here this means
					 * that one unit of difference meets out 
					 * profit requirement, so we need to put our 
					 * first bid two units under the best asks because
					 * we always need one empty slot between best ask
					 * and best bid
					 */

					return await this.finalStripes(now["asks"], await this._add(now["asks"],dec,-2),$pair)

				} else {

					/**
					 * If we're here this means we have a one unit spread
					 * but doesn't meet our profit criteria so we open our orders
					 * using the best ask has reference (this is arbitrary).
					 */

					return await this.finalStripes(now["asks"], await this._floor(now["asks"]/ (this._spec[$pair]["profit"] * 2/100 + 1), dec),$pair)

				}	

			} 

			else 

				/**
				 * Reaching this else statement means that spread is 
				 * exactly of two units, conditions are preatty similar to
				 * above ones.
				 */

			{


				if (now["asks"]/now["bids"] >= this._spec[$pair]["profit"] * 2/100 + 1) {

					return await this.finalStripes(now["asks"], now["bids"],$pair)

				} else {

					return await this.finalStripes(now["asks"], await this._floor(now["asks"]/ (this._spec[$pair]["profit"] * 2/100 + 1), dec),$pair)

				}

			}

		}

		/**
		 * If we set the force liquidity option to true
		 */

		if (this._spec[$pair]["force_liquidity"]) {

			/**
			 * Reaching here we're going to determine 
			 * which is the best option to provide liquidity
			 * on this pair, we go from the best option 
			 * to the worst one.
			 */

			if (binance) {

				/**
				 * If we reach here we 
				 * got some data from binance
				 * so we duplicate here the price from
				 * binance and add our profit.
				 */

				return await this.finalStripes(binance["asks"], await this._floor(binance["asks"]/ (this._spec[$pair]["profit"] * 2/100 + 1), dec),$pair)

			} else {

				if (arb) {

					/**
					 * Reaching here means that we were able to determine
					 * our arbitrage price from ETH and BTC
					 * now we choose the most narraow spread from the actual 
					 * price and the arbitrage price
					 */

					if(now["asks"]/now["bids"] > arb["asks"]/arb["bids"]){

						return await this.finalStripes(arb["asks"], await this._floor(arb["asks"]/ (this._spec[$pair]["profit"] * 2/100 + 1), dec),$pair)

					}

					else {

						return await this.finalStripes(now["asks"], await this._floor(now["asks"]/ (this._spec[$pair]["profit"] * 2/100 + 1), dec),$pair)

					}

				} else {

					/**
					 * Be carefull reaching here can lead 
					 * to some lost in particular cases
					 * see doc ________________________
					 */

					return await this.finalStripes(now["asks"], await this._floor(now["asks"]/ (this._spec[$pair]["profit"] * 2/100 + 1), dec),$pair)


				}

			}


		} else {

			/**
			 * Reaching here means we don't want to 
			 * force liquidity on this pair but want to
			 * put orders on the order book
			 */

			if (arb) {

				if(now["asks"]/now["bids"] > arb["asks"]/arb["bids"]){

					if (arb["asks"]/arb["bids"] > this._spec[$pair]["profit"] * 2/100 + 1) {

						/**
						 * You might be aware that in this case you will in fact 
						 * increase your profit, this one will be equal to : arb["asks"]/arb["bids"]
						 */

						return await this.finalStripes(arb["asks"], arb["bids"],$pair);

					} else {

						return await this.finalStripes(arb["asks"], await this._floor(arb["asks"]/ (this._spec[$pair]["profit"] * 2/100 + 1), dec),$pair)

					}

				}

				else {

					if (now["asks"]/now["bids"] > this._spec[$pair]["profit"] * 2/100 + 1) {

						/**
						 * You might be aware that in this case you will in fact 
						 * increase your profit, this one will be equal to : now["asks"]/now["bids"]
						 */

						return await this.finalStripes(now["asks"], now["bids"],$pair);

					} else {

						return await this.finalStripes(now["asks"], await this._floor(now["asks"]/ (this._spec[$pair]["profit"] * 2/100 + 1), dec),$pair)

					}

				}

			} else {

				if (now["asks"]/now["bids"] > this._spec[$pair]["profit"] * 2/100 + 1) {

					/**
					 * You might be aware that in this case you will in fact 
					 * increase your profit, this one will be equal to : now["asks"]/now["bids"]
					 */

					return await this.finalStripes(now["asks"], now["bids"],$pair);

				} else {

					return await this.finalStripes(now["asks"], await this._floor(now["asks"]/ (this._spec[$pair]["profit"] * 2/100 + 1), dec),$pair)

				}


			}
		}

	}


	async finalStripes($asks,$bids,$pair){

		return new Promise(async(resolve,reject) => {

			console.log("LOG: " + new Date().toUTCString() + " starting to set up stripes on: " + $pair);

			/**
			 * our prices decimal eg COSS_ETH => 6 
			 */

			var dec = this._decimal.get($pair)["price_decimal"];

			/**
			 * The amount we set in our beginning params
			 */

			var amount_one = this._spec[$pair]["total_amount_one"] ? this._spec[$pair]["total_amount_one"] : false;
			var amount_two = this._spec[$pair]["total_amount_two"] ? this._spec[$pair]["total_amount_two"] : false;

			/**
			 * Our amount precision, means the maximum digits 
			 * allowed on the quantity of the pair
			 */

			var amount_dec = this._decimal.get($pair)["amount_decimal"];

			/**
			 * each crypto name separately
			 */

			var [cryptoo1,cryptoo2] = $pair.split("_");

			/**
			 * this is the amount we have in our wallet 
			 * for each crypto of the pair.
			 */

			var crypto1 = this._wallet[cryptoo1] ? this._wallet[cryptoo1] : 0;
			var crypto2 = this._wallet[cryptoo2] ? this._wallet[cryptoo2] : 0;

			/**
			 * if we don't have crypto in wallet 
			 * we should not go any further and return now
			 */

			if (crypto1 == 0 || crypto2 == 0) {

				console.log("\x1B[91mWARNING\x1B[0m: " + new Date().toUTCString() + " not enough funds "+
					" on "+ $pair + " stripes not opened");
				resolve(false)

			}

			/**
			 * this is the profit we want to take 
			 * between each pair of order.
			 */

			var profit = this._spec[$pair]["profit"]/100 + 1;

			/**
			 * this is our range for initially covering the 
			 * orderbook.
			 */

			var [low_bid,high_ask] = this._spec[$pair]["range"];

			try{

				$assert.ok(low_bid < high_ask,"The leftmost value of the range has to be the lowest")
				$assert.ok(this._spec[$pair]["ref"] == 1 || this._spec[$pair]["ref"] == 0 || this._spec[$pair]["ref"] == 2,"ref has to be 0 or 1 ONLY see doc");
				$assert.ok(typeof this._spec[$pair]['amount'] == "number" || this._spec[$pair]["amount"] == false,"amount has to be a number or false");

			} catch(e){

				console.log("\x1B[91mWARNING\x1B[0m: " + new Date().toUTCString() + " an error occured while opening stripes "+
					" on "+ $pair +" no stripes were opened. Error : " + e);
				resolve(false)

			}

			this._spec[$pair]["orderbook"] = {};

			/**
			 * those variables are used to create our orders 
			 * properly.
			 */

			var ready = true;

			var ask_start = $asks;

			var bid_start = $bids;

			var orders_asks = [];

			var orders_bids = [];

			var quantity1 = 0;

			var quantity2 = 0;

			if (this._spec[$pair]["amount"]) {

				/**
				 * if we gave to the program the exact 
				 * amount of crypto that we want to trade
				 * for our market making we reach here.
				 */

				while (ready){

					/**
					 * typically this while loop
					 * allows us to determine at which 
					 * price each order will be opened
					 */

					while(ask_start < high_ask){

						/**
						 * first regarding the orders on the asks
						 * side, we take our starting ask price, determined
						 * in our set stripe function, then multiply it by our
						 * profit until reaching our high ask price, given in the range
						 * of the pair _spec variable.
						 */

						var amount = await this.quantity(this._spec[$pair]["amount"],this._spec[$pair]["ref"],ask_start,$pair)

						quantity1 += amount

						orders_asks.push([parseFloat(ask_start), amount]);

						/**
						 * We ceil our new price to have at least the profit
						 * we gave to our program.
						 */

						ask_start = await this._ceil(ask_start * profit, dec);

					}

					while(bid_start > low_bid){

						/**
						 * we do the same on the bid side
						 * for both sides we keep a trace 
						 * of the total quantity that would be taken 
						 * from our wallet in order to open all the orders.
						 */

						var amount = await this.quantity(this._spec[$pair]["amount"],this._spec[$pair]["ref"],bid_start,$pair)

						quantity2 += amount * bid_start;

						orders_bids.push([parseFloat(bid_start), amount]);

						bid_start = await this._floor(bid_start / profit, dec);

					}

					if (quantity1 > crypto1 || quantity2 > crypto2) {

						/**
						 * if one of the total amount of crypto
						 * that we want to take are superior than 
						 * what we have in our wallet, we rise our profit
						 * in order to open less orders and this should allow to 
						 * use less crypto, in order to meet our wallet criteria.
						 */

						profit *= this._spec[$pair]["profit"]/100 +1 ;

						if (profit > 3) {

							console.log("\x1B[91mWARNING\x1B[0m: " + new Date().toUTCString() + " not enough funds "+
							" on "+ $pair + " stripes not opened");
							resolve(false);

						} else {

							/**
							 * we need in order to keep a coherent gap between each side
							 * adapt our starting bid price.
							 */

							ask_start = $asks;

							while($asks / $bids < (profit - 1)  * 2 + 1 ){
								$bids = await this._floor(($bids * 10 ** dec - 1) / 10 ** dec, dec);

							}

							bid_start = $bids;
							quantity1 = 0;
							quantity2 = 0;
							orders_asks = [];
							orders_bids = [];
						}

					} else {

						ready = false;

						/**
						 * if we changed our profit we have to change it 
						 * in our pair specification.
						 */

						if (this._spec[$pair]["profit"]/100 + 1 != profit) {

							this._spec[$pair]["profit"] = (profit - 1) * 100;

							console.log("\x1B[38;5;226mNOTICE\x1B[0m: " + new Date().toUTCString() + " the configuration made us change our profit " +
								" new profit on " + $pair + " is: " + this._spec[$pair]["profit"] + " in percent");

						}

					}

				}

				this._spec[$pair]["orderbook"]["bids"] = [];
				this._spec[$pair]["orderbook"]["asks"] = [];

				/**
				 * if the amount of orders we want to open would break the API
				 * request limit call we have to return false in order, to give the 
				 * lead to our function that would wait for one minut 
				 */

				if (!orders_asks.length || !orders_bids.length) {

					console.log("\x1B[91mWARNING\x1B[0m: " + new Date().toUTCString() + " Can't have empty opening orders try your code with the sandbox");
					resolve(false);

				}

				if (orders_asks.length + orders_bids.length + this._callcounter > 700){

					console.log("LOG: " + new Date().toUTCString() + " reached API limit request waiting 1 minute to drain on: " + $pair);

					setTimeout(async() => {

						console.log("LOG: " + new Date().toUTCString() + " draining ok on: " + $pair);

					 	for(var value of orders_asks){

							if(await this.openOrder(value[0],value[1],"SELL",$pair))this._spec[$pair]["orderbook"]["asks"].push(value[0]);

						}

						for(var value of orders_bids){

							if(await this.openOrder(value[0],value[1],"BUY",$pair))this._spec[$pair]["orderbook"]["bids"].push(value[0]);

						}
						console.log("LOG: " + new Date().toUTCString() + " pair: ",$pair," order asks",this._spec[$pair]["orderbook"]["asks"]);
						console.log("LOG: " + new Date().toUTCString() + " pair: ",$pair," order bids",this._spec[$pair]["orderbook"]["bids"]);
						console.log("LOG: " + new Date().toUTCString() + " wallet on " + cryptoo1 + ": ",this._wallet[cryptoo1]);
						console.log("LOG: " + new Date().toUTCString() + " wallet on " + cryptoo2 + ": ",this._wallet[cryptoo2]);
						this._spec[$pair]["orderbook"]["asks_length"] = this._spec[$pair]["orderbook"]["asks"].length;
						this._spec[$pair]["orderbook"]["bids_length"] = this._spec[$pair]["orderbook"]["bids"].length;
						resolve(true);

					 },65000)

				} else {

					for(var value of orders_asks){

						if(await this.openOrder(value[0],value[1],"SELL",$pair))this._spec[$pair]["orderbook"]["asks"].push(value[0]);

					}

					for(var value of orders_bids){

						if(await this.openOrder(value[0],value[1],"BUY",$pair))this._spec[$pair]["orderbook"]["bids"].push(value[0]);

					}

					console.log("LOG: " + new Date().toUTCString() + " pair: ",$pair," order asks",this._spec[$pair]["orderbook"]["asks"]);
					console.log("LOG: " + new Date().toUTCString() + " pair: ",$pair," order bids",this._spec[$pair]["orderbook"]["bids"]);
					console.log("LOG: " + new Date().toUTCString() + " wallet on " + cryptoo1 + ": ",this._wallet[cryptoo1]);
					console.log("LOG: " + new Date().toUTCString() + " wallet on " + cryptoo2 + ": ",this._wallet[cryptoo2]);
					this._spec[$pair]["orderbook"]["asks_length"] = this._spec[$pair]["orderbook"]["asks"].length;
					this._spec[$pair]["orderbook"]["bids_length"] = this._spec[$pair]["orderbook"]["bids"].length;
					resolve(true);

				}




			} else {

				/**
				 * Here the situation is different this is 
				 * the case where we are using the total amount
				 * instead of the exact amount per order.
				 */

				while(ready){

					while(ask_start < high_ask){

						/**
						 * those while loops are used to
						 * determine the number of orders that would be created on each pair
						 */

						quantity1 += 1

						ask_start = await this._ceil(ask_start * profit, dec);

					}

					while(bid_start > low_bid){

						quantity2 += 1

						bid_start = await this._floor(bid_start / profit, dec);

					}

					/**
					 * Here we get the lowest of our two amounts 
					 * in order to meet our wallet restrictions.
					 */

					var amount1 = await this._floor(amount_one / quantity1,amount_dec);
					var amount2 = await this._floor(amount_two / $bids / quantity2,amount_dec);

					var amount_fin = Math.min(amount1,amount2)
					this._spec[$pair]["amount"] = this._spec[$pair]["ref"] == 0 ? amount_fin : amount_fin * bid_start;

					/**
					 * If the final amount is below the minimal amount 
					 * for the pair, we loop again and increase our spread
					 * to get a higher amount.
					 */

					if (amount_fin * $asks < this._amount_min.get(cryptoo2) || amount_fin * bid_start < this._amount_min.get(cryptoo2)) {

						profit *= this._spec[$pair]["profit"]/100 +1 ;

						if (profit > 3) {

							console.log("\x1B[91mWARNING\x1B[0m: " + new Date().toUTCString() + " not enough funds "+
							" on "+ $pair + " stripes not opened");
							resolve(false);

						} else {

							quantity1 = 0;
							quantity2 = 0;
							ask_start = $asks;

							while($asks / $bids < (profit - 1)  * 2 + 1 ){
								$bids = await this._floor(($bids * 10 ** dec - 1) / 10 ** dec, dec);

							}

							bid_start = $bids;

						}

					} else {

						ready = false;

						if (this._spec[$pair]["profit"]/100 + 1 != profit) {

							this._spec[$pair]["profit"] = (profit - 1) * 100;

							console.log("\x1B[38;5;226mNOTICE\x1B[0m: " + new Date().toUTCString() + " the configuration made us change our profit " +
								" new profit on " + $pair + " is: " + this._spec[$pair]["profit"] + " in percent");

							ask_start = $asks;
							bid_start = $bids;
						} else {

							bid_start = $bids;
							ask_start = $asks;

						}	

					}

				}

				ready = true;
				quantity1 = 0;
				quantity2 = 0;

				/**
				 * this while loop is preatty the same 
				 * as the first nested one of this function.
				 */

				while (ready){

					while(ask_start < high_ask){


						var amount = await this.quantity(this._spec[$pair]["amount"],this._spec[$pair]["ref"],ask_start,$pair)

						quantity1 += amount

						orders_asks.push([ask_start, amount]);

						ask_start = await this._ceil(ask_start * profit, dec);

					}

					while(bid_start > low_bid){

						var amount = await this.quantity(this._spec[$pair]["amount"],this._spec[$pair]["ref"],bid_start,$pair)

						quantity2 += amount * bid_start;

						orders_bids.push([bid_start, amount]);

						bid_start = await this._floor(bid_start / profit, dec);

					}

					if (quantity1 > crypto1 || quantity2 > crypto2) {

						profit *= this._spec[$pair]["profit"]/100 +1 ;

						if (profit > 3) {

							console.log("\x1B[91mWARNING\x1B[0m: " + new Date().toUTCString() + " not enough funds "+
							" on "+ $pair + " stripes not opened");
							resolve(false);

						} else {

							ask_start = $asks;

							while($asks / $bids < (profit - 1)  * 2 + 1 ){
								$bids = await this._floor(($bids * 10 ** dec - 1) / 10 ** dec, dec);

							}
							quantity1 = 0;
							quantity2 = 0;
							bid_start = $bids;
							orders_asks = [];
							orders_bids = [];

						}

					} else {

						ready = false;

						if (this._spec[$pair]["profit"]/100 + 1 != profit) {

							this._spec[$pair]["profit"] = (profit - 1) * 100;
							console.log("\x1B[38;5;226mNOTICE\x1B[0m: " + new Date().toUTCString() + " the configuration made us change our profit " +
								" new profit on " + $pair + " is: " + this._spec[$pair]["profit"] + " in percent");

						}

					}

				}

				this._spec[$pair]["orderbook"]["bids"] = [];
				this._spec[$pair]["orderbook"]["asks"] = [];

				/**
				 * if our call would break the api request limit
				 * we have to wait for one minut to reset the limit.
				 */

				if (!orders_asks.length || !orders_bids.length) {

					console.log("\x1B[91mWARNING\x1B[0m: " + new Date().toUTCString() + " Can't have empty opening orders try your code with the sandbox");
					resolve(false);

				}

				if (orders_asks.length + orders_bids.length + this._callcounter > 700){

					console.log("LOG: " + new Date().toUTCString() + " reached API limit request waiting 1 minute to drain on: " + $pair);

					 setTimeout(async() => {

					 	console.log("LOG: " + new Date().toUTCString() + " draining ok on: " + $pair);

						for(var value of orders_asks){

							if(await this.openOrder(value[0],value[1],"SELL",$pair))this._spec[$pair]["orderbook"]["asks"].push(value[0]);

						}

						for(var value of orders_bids){

							if(await this.openOrder(value[0],value[1],"BUY",$pair))this._spec[$pair]["orderbook"]["bids"].push(value[0]);

						}

						console.log("LOG: " + new Date().toUTCString() + " pair: ",$pair," order asks",this._spec[$pair]["orderbook"]["asks"]);
						console.log("LOG: " + new Date().toUTCString() + " pair: ",$pair," order bids",this._spec[$pair]["orderbook"]["bids"]);
						console.log("LOG: " + new Date().toUTCString() + " wallet on " + cryptoo1 + ": ",this._wallet[cryptoo1]);
						console.log("LOG: " + new Date().toUTCString() + " wallet on " + cryptoo2 + ": ",this._wallet[cryptoo2]);

						this._spec[$pair]["orderbook"]["asks_length"] = this._spec[$pair]["orderbook"]["asks"].length;
						this._spec[$pair]["orderbook"]["bids_length"] = this._spec[$pair]["orderbook"]["bids"].length;
						resolve(true);

					 },65000)

				} else {

					for(var value of orders_asks){

						if(await this.openOrder(value[0],value[1],"SELL",$pair))this._spec[$pair]["orderbook"]["asks"].push(value[0]);

					}

					for(var value of orders_bids){

						if(await this.openOrder(value[0],value[1],"BUY",$pair))this._spec[$pair]["orderbook"]["bids"].push(value[0]);

					}

					this._spec[$pair]["orderbook"]["asks_length"] = this._spec[$pair]["orderbook"]["asks"].length;
					this._spec[$pair]["orderbook"]["bids_length"] = this._spec[$pair]["orderbook"]["bids"].length;

					console.log("LOG: " + new Date().toUTCString() + " pair: ",$pair," order asks",this._spec[$pair]["orderbook"]["asks"]);
					console.log("LOG: " + new Date().toUTCString() + " pair: ",$pair," order bids",this._spec[$pair]["orderbook"]["bids"]);
					console.log("LOG: " + new Date().toUTCString() + " wallet on " + cryptoo1 + ": ",this._wallet[cryptoo1]);
					console.log("LOG: " + new Date().toUTCString() + " wallet on " + cryptoo2 + ": ",this._wallet[cryptoo2]);

					resolve(true);

				}

			}
		})

	}

	async _add(price,dec,amount){

		return Math.round((price * 10 ** dec) + amount)/ 10 ** dec;

	}

	async quantity($amount,$ref,$price,$pair){

		if ($ref == 0) {

			return $amount;

		} else if ($ref == 1) {

			return await this._ceil($amount/$price,this._decimal.get($pair)["amount_decimal"])

		} else if ($ref == 2) {

			if (!this._spec[$pair]["alt_amount"]) {

				var amount = await this._ceil($amount/$price,this._decimal.get($pair)["amount_decimal"]);
				this._spec[$pair]["alt_amount"] = amount;

				return amount;

			} else {

				return await this._ceil((($amount/$price) + this._spec[$pair]["alt_amount"]) / 2 ,this._decimal.get($pair)["amount_decimal"]);

			}

		}

	}

	async openOrder(price,quantity,side,$pair,ref = 0){

		this._callcounter++;
		if (this._kill) { return false}

		var $pairs = $pair.split("_");

		if(price * quantity < this._amount_min.get($pairs[1])){

			quantity = await this._ceil(this._amount_min.get($pairs[1]) / price,this._decimal.get($pair)["amount_decimal"]);
            console.log("\x1B[38;5;226mNOTICE\x1B[0m: " + new Date().toUTCString() + " changing opening amount, on " + $pair +
            " price: ", price, " quantity: ", quantity, " base currency amount: ",price * quantity);
		} 

		if (side == "BUY" && ref == 0) {

			this._wallet[$pairs[1]] -= price*quantity; 
			if (this._wallet[$pairs[1]] < 0) {

				console.log("\x1B[38;5;226mNOTICE\x1B[0m: " + new Date().toUTCString() + " order not opened cause : not enough funds, on " + $pair);

				this._wallet[$pairs[1]] += price*quantity;
				return false;

			}

		} else if(ref == 0) {

			this._wallet[$pairs[0]] -= quantity;

			if (this._wallet[$pairs[0]] < 0) {

				console.log("\x1B[38;5;226mNOTICE\x1B[0m: " + new Date().toUTCString() + " order not opened cause : not enough funds, on " + $pair);

				this._wallet[$pairs[0]] += quantity;
				return false;

			}

		}

		return new Promise((resolve,reject) => {

			var $response = "";

			var $date =  new Date().getTime() - 3000;

			var $data = '{"order_symbol": '+ $pair +',"order_price": '+ price +',' +
			'"order_side": '+ side +',"order_size": '+ quantity +','+
			'"type": limit,"timestamp": '+ $date +',"recvWindow": 5000}';


			var hmac = $crypto.createHmac("sha256",$private);
			hmac.update($data);

			var options = {

				"hostname": "trade.coss.io",
				"method": "POST",
				"port": 443,
				"path": "/c/api/v1/order/add",
				"headers": {

					"Content-Type": "application/json",
					"Content-Length": $data.length,
					"Authorization": $public,
					"Signature": hmac.digest("hex")
				}
			}

			var req = $https.request(options,async(res) => {

				res.on("data", async (chunk) => {$response += chunk.toString(); });

				res.on("end", async () => {

					try{

						$response = JSON.parse($response);

						if (!$response["order_id"]) {

							throw new Error("unexpected response");

						} else {

							console.log("LOG: " + new Date().toUTCString() +
							 " we " + side + " " + quantity + " " + $pairs[0] + " at " + price + " on " + $pair + " time : " + $response["createTime"]);

							side == "BUY" ? this._spec[$pair]["b_id"][parseFloat(price)] = $response["order_id"] : this._spec[$pair]["a_id"][parseFloat(price)] = $response["order_id"];
							side == "BUY" ? this._spec[$pair]["b_time"][parseFloat(price)] = parseFloat($response["createTime"]) : this._spec[$pair]["a_time"][parseFloat(price)] = parseFloat($response["createTime"]);

							resolve(true);

						}

					} catch(e){

						var wait = Math.round(Math.random() * 800 + 600)

						var timer = setTimeout(async () => {

							console.log("\x1B[38;5;226mNOTICE\x1B[0m: " + new Date().toUTCString() + "retry opening order on " + $pair + 
								" ERROR: " + e);

							resolve(await this.openOrder(price,quantity,side,$pair,++ref));

						},wait);

						if (ref >= 3) {

							console.log("\x1B[38;5;226mNOTICE\x1B[0m: " + new Date().toUTCString() + " too many retry when opening " +
							 +"order, order not opened on " + $pair + " ERROR:" + e); 

							if (side == "BUY" && ref == 0) {

								this._wallet[$pairs[1]] += price*quantity; 

							} else if(ref == 0) {

								this._wallet[$pairs[0]] += quantity;

							}

							clearTimeout(timer);
							resolve(false);
						}

					}

				});

			});

			req.on("error", async(e) => {

				var wait = Math.round(Math.random() * 800 + 600)

				if (ref >= 3) {

					console.log("\x1B[91mNOTICE\x1B[0m: " + new Date().toUTCString() + " an order didn't got opened " +
						" on " + pair + " this is not a fatal error the program is able to adapt itself. Error: " + e);
					resolve(false)

				}

				setTimeout(async () => {

					console.log("\x1B[38;5;226mNOTICE\x1B[0m: " + new Date().toUTCString() + "retry opening order on " + $pair + 
								" ERROR: " + e);

					resolve(await this.openOrder(price,quantity,side,$pair,++ref));

				},wait);

			});

			req.end($data);

		})

	}

	async checkOne($pair,side){

		return new Promise(async (resolve,reject) => {

			if (side) {

				await this._checkOne($pair,this._spec[$pair]["orderbook"]["asks"][0],"a_id");
				resolve(true);

			} else {

				await this._checkOne($pair,this._spec[$pair]["orderbook"]["bids"][0],"b_id");
				resolve(true);

			}

		})

	}

	async _checkOne(pair,price,side){

		return new Promise(async (resolve,reject) =>{

			if (this._callcounter > 200) {

				console.log("\x1B[38;5;226mNOTICE\x1B[0m: " + new Date().toUTCString() + " Check not done cause API call > 200");

				resolve(true);

			} else {

				this._callcounter++;

				var id = this._spec[pair][side][parseFloat(price)];	

				var $response = "";

				var $date =  new Date().getTime() - 3000;

				var $data = '{"timestamp": '+ $date +',"recvWindow": 5000,"order_id": ' + id + '}';


				var hmac = $crypto.createHmac("sha256",$private);
				hmac.update($data);

				var options = {

					"hostname": "trade.coss.io",
					"method": "POST",
					"port": 443,
					"path": "/c/api/v1/order/details",
					"headers": {

						"Content-Type": "application/json",
						"Content-Length": $data.length,
						"Authorization": $public,
						"Signature": hmac.digest("hex")
					}
				}

				var req = $https.request(options,async(res) => {

					res.on("data", async (chunk) => {$response += chunk.toString(); });

					res.on("end", async () => {

						try{

							$response = JSON.parse($response);

							if (!$response["order_id"]) {
								console.log("\x1B[38;5;226mNOTICE\x1B[0m: " + new Date().toUTCString() + " Check not done cause wrong response received");
								throw new Error("unexpected response");

							} else {

								if ($response["status"] == "filled" || parseFloat($response["executed"]) / parseFloat($response["order_size"]) > (100 - this._spec[pair]['profit'])/100 ) {

									console.log("LOG: " + new Date().toUTCString() + " order status " + $response["status"]);
									console.log("LOG: " + new Date().toUTCString() + " order executed " + $response["executed"] + " order size initial " + $response["order_size"]);

									delete this._spec[pair][side][parseFloat(price)];

									if (side[0] == "a") {

										console.log("pushing : ", {
											"a": [price.toString(),0],
											"b": [],
											"t": new Date().getTime()
										});

										this._spec[pair]["poll"].push({
											"a": [price.toString(),0],
											"b": [],
											"t": new Date().getTime()
										});

										resolve(true);

									} else {

										console.log("pushing : ", {
											"b": [price.toString(),0],
											"a": [],
											"t": new Date().getTime()
										});

										this._spec[pair]["poll"].push({
											"b": [price.toString(),0],
											"a": [],
											"t": new Date().getTime()
										});

										resolve(true);

									}

								} else {

									resolve(true);

								}

							}

						} catch(e){

							resolve(true);

						}

					});

				});

				req.on("error", async(e) => {

					resolve(true);

				});

				req.end($data);

			}
		})

	}

	async checkTest(pair,price,side){

		return new Promise(async(resolve,reject) => {

			setTimeout(async ()=> {

				if (this._spec[pair][side][price]) {

					await this._checkOne(pair,price,side);
					resolve(true);

				} else {

					resolve(true);

				}
				

			},3000)

		})

	}


}

module.exports = MMBot;
