// ==UserScript==
// @name      YTB enchant player
// @version   1.0.0
// @description Adds playback controls for speed, looping, and quality to the YouTube player.
// @include   *://*.youtube.com/**
// @exclude   *://accounts.youtube.com/*
// @exclude   *://www.youtube.com/live_chat_replay*
// @exclude   *://www.youtube.com/persist_identity*
// @run-at    document-start
// @grant     GM_registerMenuCommand
// @grant     GM_openInTab
// @grant     GM.openInTab
// @grant     GM_addStyle
// @grant     GM_setValue
// @grant     GM_getValue
// @grant     GM_xmlhttpRequest
// @grant     unsafeWindow
// @grant     GM_download
// @grant     GM_setClipboard
// ==/UserScript==
(function () {
  "use strict";

  const StorageUtil = {
    keys: {
      youtube: {
        videoPlaySpeed: "yt/videoPlaySpeed",
        functionState: "yt/functionState_01",
        videoLoop: "py/videoLoop",
      },
    },
    getDefaultFunctionState: function () {
      return {
        isOpenSpeedControl: true,
      };
    },
    getValue: function (key, defaultValue) {
      return GM_getValue(key, defaultValue);
    },
    setValue: function (key, value) {
      GM_setValue(key, value);
    },
  };

  const commonUtil = {
    onPageLoad: function (callback) {
      if (document.readyState === "complete") {
        callback();
      } else {
        window.addEventListener("DOMContentLoaded", callback, { once: true });
        window.addEventListener("load", callback, { once: true });
      }
    },
    addStyle: function (style) {
      GM_addStyle(style);
    },
    openInTab: function (
      url,
      options = { active: true, insert: true, setParent: true }
    ) {
      if (typeof GM_openInTab === "function") {
        GM_openInTab(url, options);
      } else {
        GM.openInTab(url, options);
      }
    },
    waitForElementByInterval: function (
      selector,
      target = document.body,
      allowEmpty = true,
      delay = 10,
      maxDelay = 10 * 1e3
    ) {
      return new Promise((resolve, reject) => {
        let totalDelay = 0;
        let element = target.querySelector(selector);
        let result = allowEmpty ? !!element : !!element && !!element.innerHTML;
        if (result) {
          resolve(element);
        }
        const elementInterval = setInterval(() => {
          if (totalDelay >= maxDelay) {
            clearInterval(elementInterval);
            resolve(null);
          }
          element = target.querySelector(selector);
          result = allowEmpty ? !!element : !!element && !!element.innerHTML;
          if (result) {
            clearInterval(elementInterval);
            resolve(element);
          } else {
            totalDelay += delay;
          }
        }, delay);
      });
    },
    startFadeoutAnimation: function (
      element,
      startOpacity = 0.9,
      duration = 1500
    ) {
      let opacity = startOpacity;
      const startTime = performance.now();
      let activeAnimationId = null;

      // Function to cancel previous animation on the same element if any
      if (element.dataset.activeAnimationId) {
        cancelAnimationFrame(parseInt(element.dataset.activeAnimationId, 10));
      }

      const fadeStep = (timestamp) => {
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);
        opacity = startOpacity * (1 - progress);
        element.style.opacity = opacity;
        element.style.filter = `alpha(opacity=${opacity * 100})`;
        if (progress < 1) {
          activeAnimationId = requestAnimationFrame(fadeStep);
          element.dataset.activeAnimationId = activeAnimationId;
        } else {
          element.style.display = "none";
          delete element.dataset.activeAnimationId;
        }
      };
      activeAnimationId = requestAnimationFrame(fadeStep);
      element.dataset.activeAnimationId = activeAnimationId;
    },
  };

  const SpeedControl = {
    currentSpeed: 1,
    activeAnimationId: null,
    run: function () {
      if (!/youtube\.com/.test(window.location.host)) {
        return new Promise((resolve) => {
          resolve();
        });
      }
      return new Promise((resolve) => {
        const speedControl = StorageUtil.getValue(
          StorageUtil.keys.youtube.functionState.speedControl,
          true
        );
        if (!speedControl) {
          resolve();
          return;
        }
        const storageSpeed = StorageUtil.getValue(
          StorageUtil.keys.youtube.videoPlaySpeed,
          1
        );
        this.currentSpeed = parseFloat(storageSpeed);
        this.insertStyle();
        commonUtil.onPageLoad(async () => {
          await this.genrate();
          this.setVideoRate(storageSpeed);
          this.videoObserver();
          resolve();
        });
      });
    },
    insertStyle: function () {
      const speedBtnStyle = `
			.SpeedControl_Extension_Btn_X{
				width: 4em !important;
				float: left;
				text-align: center !important;
				display: flex !important;
				justify-content: center !important;
				align-items: center !important;
				border-radius: 0.5em !important;
				font-size:14px !important;
				font-weight:bold!important;
			}
			.SpeedControl_Extension_Btn_X:hover{
				color:red;
				font-weight: bold;
			}
		`;
      const speedShowStyle = `
			#youtube-extension-text-box {
				position: absolute!important;
				margin: auto!important;
				top: 0px!important;
				right: 0px!important;
				bottom: 0px!important;
				left: 0px!important;
				border-radius: 20px!important;
				font-size: 30px!important;
				background-color: #303031!important;
				color: #f3f3f3!important;
				z-index: 99999999999999999!important;
				opacity: 0.8!important;
				width: 80px!important;
				height: 80px!important;
				line-height: 80px!important;
				text-align: center!important;
				padding: 0px!important;
			}
		`;
      const speedOptionsStyle = `
			.SpeedControl_Extension_Speed-Options {
				position: absolute!important;
				background: #000!important;
				color: white!important;
				border-radius: 8px!important;
				box-sizing: border-box!important;
				z-index:999999999999!important;
				display:none;
				padding:10px!important;
				font-weight:bold!important;
			}
			.SpeedControl_Extension_Speed-Options >.SpeedControl_Extension_Speed-Option-Item {
				cursor: pointer!important;
				height: 25px!important;
				line-height: 25px!important;
				font-size:12px!important;
				text-align: center!important;
			}
			.SpeedControl_Extension_Speed-Options >.SpeedControl_Extension_Speed-Option-Item-Active,
			.SpeedControl_Extension_Speed-Options >.SpeedControl_Extension_Speed-Option-Item:hover {
				color: red!important;
			}
		`;

      commonUtil.addStyle(speedBtnStyle + speedShowStyle + speedOptionsStyle);
    },
    genrate: async function () {
      const speedControlBtn = document.createElement("div");
      speedControlBtn.className = "ytp-button SpeedControl_Extension_Btn_X";
      const speedText = document.createElement("span");
      speedText.textContent = "" + this.currentSpeed + "×";
      speedControlBtn.appendChild(speedText);
      const player = await commonUtil.waitForElementByInterval(
        "#player-container-outer .html5-video-player"
      );
      if (player) {
        const rightControls = player.querySelector(".ytp-right-controls");
        const ScreenShot_Codehemu_Btn = document.querySelector(
          ".SpeedControl_Extension_Btn_X"
        );
        if (rightControls && !ScreenShot_Codehemu_Btn) {
          rightControls.prepend(speedControlBtn);
          this.genrateOptions(speedControlBtn, player);
        }
      }
    },
    genrateOptions: function (button, player) {
      const speedOptions = document.createElement("div");
      speedOptions.id = "SpeedControl_Extension_Speed-Options";
      speedOptions.className = "SpeedControl_Extension_Speed-Options";
      const speeds = ["0.8", "1.0", "1,1", "1.25", "1.5", "1.75", "2.0"];
      speeds.forEach((speed) => {
        const option = document.createElement("div");
        option.className = "SpeedControl_Extension_Speed-Option-Item";
        option.textContent = `${speed}x`;
        option.dataset.speed = speed;
        if (parseFloat(speed) === this.currentSpeed) {
          option.classList.add(
            "SpeedControl_Extension_Speed-Option-Item-Active"
          );
        }
        speedOptions.appendChild(option);
        option.addEventListener("click", (event) => {
          const speedValue = parseFloat(speed);
          this.speedDisplayText("" + speedValue + "×");
          this.setVideoRate(speedValue);
          this.currentSpeed = speedValue;
          this.updateVideoPlaySpeedStorage(speedValue);
          button.querySelector("span").textContent = "" + speedValue + "×";
          speedOptions
            .querySelectorAll(".SpeedControl_Extension_Speed-Option-Item")
            .forEach((element) => {
              element.classList.remove(
                "SpeedControl_Extension_Speed-Option-Item-Active"
              );
            });
          event.target.classList.add(
            "SpeedControl_Extension_Speed-Option-Item-Active"
          );
        });
      });
      player.appendChild(speedOptions);
      let isHovering = false;
      button.addEventListener("mouseenter", () => {
        speedOptions.style.display = "block";
        var containerRect = player.getBoundingClientRect();
        var buttonRect = button.getBoundingClientRect();
        var speedOptionsRect = speedOptions.getBoundingClientRect();
        var left =
          buttonRect.left -
          containerRect.left -
          speedOptionsRect.width / 2 +
          buttonRect.width / 2;
        var top =
          buttonRect.top - containerRect.top - speedOptions.clientHeight;
        speedOptions.style.left = `${left}px`;
        speedOptions.style.top = `${top}px`;
      });
      button.addEventListener("mouseleave", () => {
        isHovering = false;
        setTimeout(() => {
          if (!isHovering) {
            speedOptions.style.display = "none";
          }
        }, 100);
      });
      speedOptions.addEventListener("mouseenter", () => {
        isHovering = true;
      });
      speedOptions.addEventListener("mouseleave", () => {
        isHovering = false;
        speedOptions.style.display = "none";
      });
    },
    updateVideoPlaySpeedStorage: function (speedValue) {
      StorageUtil.setValue(StorageUtil.keys.youtube.videoPlaySpeed, speedValue);
    },
    speedDisplayText: function (speedText) {
      let elementId = "youtube-extension-text-box";
      let element = document.getElementById(elementId);
      if (!element) {
        let mediaElement = document.getElementById("movie_player");
        mediaElement.insertAdjacentHTML(
          "afterbegin",
          `<div id="${elementId}">${speedText}</div>`
        );
        element = document.getElementById(elementId);
      } else {
        element.textContent = speedText;
      }
      element.style.display = "block";
      element.style.opacity = 0.8;
      element.style.filter = `alpha(opacity=${0.8 * 100})`;
      commonUtil.startFadeoutAnimation(element);
    },
    setVideoRate: function (speed) {
      const videoElement = document.querySelector("video");
      if (!videoElement) return;
      videoElement.playbackRate = speed;
    },
    videoObserver: function () {
      const checkVideoInterval = setInterval(() => {
        const videoElement = document.querySelector("video");
        if (videoElement) {
          clearInterval(checkVideoInterval);
          const observer = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
              if (
                mutation.type === "attributes" &&
                mutation.attributeName === "src"
              ) {
                videoElement.playbackRate = this.currentSpeed;
              }
            }
          });
          observer.observe(videoElement, {
            attributes: true,
          });
        }
      }, 1500);
    },
  };

  const LoopControl = {
    videoLoopState: false,
    videoLoopInterval: null,
    run: function () {
      if (!/youtube\.com/.test(window.location.host)) {
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        this.videoLoopState = StorageUtil.getValue(
          StorageUtil.keys.youtube.videoLoop,
          false
        );
        commonUtil.onPageLoad(async () => {
          await this.generate();
          this.videoLoopEvent();
          resolve();
        });
      });
    },
    generateLoopSvg: function () {
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("width", "24");
      svg.setAttribute("height", "24");
      svg.style.fill = "white";
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute(
        "d",
        "M6.8762659,15.1237341 C7.93014755,16.8486822 9.83062143,18 12,18 C14.6124377,18 16.8349158,16.3303847 17.6585886,14 L19.747965,14 C18.8598794,17.4504544 15.7276789,20 12,20 C9.28005374,20 6.87714422,18.6426044 5.43172915,16.5682708 L3,19 L3,13 L9,13 L6.8762659,15.1237341 Z M17.1245693,8.87543068 C16.0703077,7.15094618 14.1695981,6 12,6 C9.3868762,6 7.16381436,7.66961525 6.33992521,10 L4.25,10 C5.13831884,6.54954557 8.27134208,4 12,4 C14.7202162,4 17.123416,5.35695218 18.5692874,7.43071264 L21,5 L21,11 L15,11 L17.1245693,8.87543068 Z"
      );
      svg.appendChild(path);
      return svg;
    },
    generate: async function () {
      const loopButton = document.createElement("button");
      loopButton.className = "ytp-button LoopControl_Extension_Btn_X";
      loopButton.title = "Loop";
      loopButton.style.cssText = "width: 48px !important;";
      const loopBtnStyle = `
			.LoopControl_Extension_Btn_X{
                width: 4em !important;
				float: left;
				text-align: center !important;
				display: flex !important;
				justify-content: center !important;
				align-items: center !important;
				border-radius: 0.5em !important;
				font-size:14px !important;
				font-weight:bold!important;
			}
			.LoopControl_Extension_Btn_X:hover{
				font-weight: bold;
			}
		`;
      commonUtil.addStyle(loopBtnStyle);
      const svgIcon = this.generateLoopSvg();
      loopButton.appendChild(svgIcon);

      if (this.videoLoopState) {
        svgIcon.style.fill = "red";
      }

      loopButton.addEventListener("click", () => {
        this.videoLoopState = !this.videoLoopState;
        svgIcon.style.fill = this.videoLoopState ? "red" : "white";
        StorageUtil.setValue(
          StorageUtil.keys.youtube.videoLoop,
          this.videoLoopState
        );
        this.videoLoopEvent();
      });

      const player = await commonUtil.waitForElementByInterval(
        "#player-container-outer .html5-video-player"
      );
      if (player) {
        const speedControlButton = player.querySelector(
          ".SpeedControl_Extension_Btn_X"
        );
        if (speedControlButton) {
          speedControlButton.insertAdjacentElement("afterend", loopButton);
        }
      }
    },
    videoLoopEvent: function () {
      if (this.videoLoopInterval) {
        clearInterval(this.videoLoopInterval);
        this.videoLoopInterval = null;
      }
      const videoElement = document.querySelector(
        "#movie_player > div.html5-video-container > video"
      );
      if (videoElement) {
        if (this.videoLoopState) {
          videoElement.setAttribute("loop", "true");
        } else {
          videoElement.removeAttribute("loop");
        }

        // This interval ensures the loop attribute is correctly set,
        // even if other scripts (including YouTube's own) modify it.
        // It also handles video changes (when the `src` attribute of the video element changes).
        this.videoLoopInterval = setInterval(() => {
          const currentVideo = document.querySelector(
            "#movie_player > div.html5-video-container > video"
          );
          if (currentVideo) {
            if (this.videoLoopState && !currentVideo.hasAttribute("loop")) {
              currentVideo.setAttribute("loop", "true");
            } else if (
              !this.videoLoopState &&
              currentVideo.hasAttribute("loop")
            ) {
              currentVideo.removeAttribute("loop");
            }
          }
        }, 1000);
      }
    },
  };

  const QualityControl = {
    currentQuality: "auto",
    activeAnimationId: null,
    run: function () {
      if (!/youtube\.com/.test(window.location.host)) {
        return new Promise((resolve) => {
          resolve();
        });
      }
      return new Promise((resolve) => {
        // For now, we don't have a setting to disable it, but we could add one.
        // const qualityControl = StorageUtil.getValue(StorageUtil.keys.youtube.functionState.qualityControl, true);
        // if (!qualityControl) {
        //   resolve();
        //   return;
        // }
        this.insertStyle();
        commonUtil.onPageLoad(async () => {
          await this.generate();
          this.videoObserver();
          resolve();
        });
      });
    },
    insertStyle: function () {
      const qualityBtnStyle = `
			.QualityControl_Extension_Btn_X{
				width: 4em !important;
				float: left;
				text-align: center !important;
				display: flex !important;
				justify-content: center !important;
				align-items: center !important;
				border-radius: 0.5em !important;
				font-size:14px !important;
				font-weight:bold!important;
			}
			.QualityControl_Extension_Btn_X:hover{
				color:red;
				font-weight: bold;
			}
		`;
      const qualityShowStyle = `
			#youtube-extension-quality-text-box {
				position: absolute!important;
				margin: auto!important;
				top: 0px!important;
				right: 0px!important;
				bottom: 0px!important;
				left: 0px!important;
				border-radius: 20px!important;
				font-size: 30px!important;
				background-color: #303031!important;
				color: #f3f3f3!important;
				z-index: 99999999999999999!important;
				opacity: 0.8!important;
				width: 80px!important;
				height: 80px!important;
				line-height: 80px!important;
				text-align: center!important;
				padding: 0px!important;
			}
		`;
      const qualityOptionsStyle = `
			.QualityControl_Extension_Quality-Options {
				position: absolute!important;
				background: #000!important;
				color: white!important;
				border-radius: 8px!important;
				box-sizing: border-box!important;
				z-index:999999999999!important;
				display:none;
				padding:10px!important;
				font-weight:bold!important;
			}
			.QualityControl_Extension_Quality-Options >.QualityControl_Extension_Quality-Option-Item {
				cursor: pointer!important;
				height: 25px!important;
				line-height: 25px!important;
				font-size:12px!important;
				text-align: center!important;
			}
			.QualityControl_Extension_Quality-Options >.QualityControl_Extension_Quality-Option-Item-Active,
			.QualityControl_Extension_Quality-Options >.QualityControl_Extension_Quality-Option-Item:hover {
				color: red!important;
			}
		`;

      commonUtil.addStyle(
        qualityBtnStyle + qualityShowStyle + qualityOptionsStyle
      );
    },
    generate: async function () {
      const qualityControlBtn = document.createElement("div");
      qualityControlBtn.className = "ytp-button QualityControl_Extension_Btn_X";
      qualityControlBtn.innerHTML = `<span>${this.currentQuality}</span>`;

      const player = await commonUtil.waitForElementByInterval(
        "#player-container-outer .html5-video-player"
      );
      const moviePlayer = document.getElementById("movie_player");

      if (moviePlayer && typeof moviePlayer.getPlaybackQuality === "function") {
        const quality = moviePlayer.getPlaybackQuality();
        const qualityLabel = moviePlayer
          .getAvailableQualityData()
          .find((q) => q.quality === quality)?.qualityLabel;
        if (qualityLabel) {
          this.currentQuality = quality;
          qualityControlBtn.querySelector("span").textContent = qualityLabel;
        }
      }

      if (player) {
        const rightControls = player.querySelector(".ytp-right-controls");
        const existingBtn = document.querySelector(
          ".QualityControl_Extension_Btn_X"
        );
        if (rightControls && !existingBtn) {
          const speedBtn = rightControls.querySelector(
            ".SpeedControl_Extension_Btn_X"
          );
          if (speedBtn) {
            speedBtn.insertAdjacentElement("afterend", qualityControlBtn);
          } else {
            rightControls.prepend(qualityControlBtn);
          }
          this.generateOptions(qualityControlBtn, player);
        }
      }
    },
    generateOptions: function (button, player) {
      const qualityOptions = document.createElement("div");
      qualityOptions.id = "QualityControl_Extension_Quality-Options";
      qualityOptions.className = "QualityControl_Extension_Quality-Options";
      player.appendChild(qualityOptions);

      let isHovering = false;
      button.addEventListener("mouseenter", () => {
        const moviePlayer = document.getElementById("movie_player");
        if (
          !moviePlayer ||
          typeof moviePlayer.getAvailableQualityData !== "function"
        )
          return;

        const qualities = moviePlayer.getAvailableQualityData();
        if (!qualities || qualities.length === 0) return;

        qualityOptions.innerHTML = ""; // Clear old options

        qualities
          .filter((q) => q.isPlayable)
          .forEach((qualityData) => {
            const option = document.createElement("div");
            option.className = "QualityControl_Extension_Quality-Option-Item";
            option.textContent = qualityData.qualityLabel;
            option.dataset.quality = qualityData.quality;
            if (qualityData.quality === this.currentQuality) {
              option.classList.add(
                "QualityControl_Extension_Quality-Option-Item-Active"
              );
            }
            qualityOptions.appendChild(option);
            option.addEventListener("click", (event) => {
              const qualityValue = qualityData.quality;
              const qualityLabel = qualityData.qualityLabel;
              this.qualityDisplayText(qualityLabel);
              this.setVideoQuality(qualityValue);
              this.currentQuality = qualityValue;
              button.querySelector("span").textContent = qualityLabel;
              qualityOptions
                .querySelectorAll(
                  ".QualityControl_Extension_Quality-Option-Item"
                )
                .forEach((element) => {
                  element.classList.remove(
                    "QualityControl_Extension_Quality-Option-Item-Active"
                  );
                });
              event.target.classList.add(
                "QualityControl_Extension_Quality-Option-Item-Active"
              );
            });
          });

        qualityOptions.style.display = "block";
        var containerRect = player.getBoundingClientRect();
        var buttonRect = button.getBoundingClientRect();
        var qualityOptionsRect = qualityOptions.getBoundingClientRect();
        var left =
          buttonRect.left -
          containerRect.left -
          qualityOptionsRect.width / 2 +
          buttonRect.width / 2;
        var top =
          buttonRect.top - containerRect.top - qualityOptions.clientHeight;
        qualityOptions.style.left = `${left}px`;
        qualityOptions.style.top = `${top}px`;
      });
      button.addEventListener("mouseleave", () => {
        isHovering = false;
        setTimeout(() => {
          if (!isHovering) {
            qualityOptions.style.display = "none";
          }
        }, 100);
      });
      qualityOptions.addEventListener("mouseenter", () => {
        isHovering = true;
      });
      qualityOptions.addEventListener("mouseleave", () => {
        isHovering = false;
        qualityOptions.style.display = "none";
      });
    },
    qualityDisplayText: function (qualityText) {
      let elementId = "youtube-extension-quality-text-box";
      let element = document.getElementById(elementId);
      if (!element) {
        let mediaElement = document.getElementById("movie_player");
        mediaElement.insertAdjacentHTML(
          "afterbegin",
          `<div id="${elementId}">${qualityText}</div>`
        );
        element = document.getElementById(elementId);
      } else {
        element.textContent = qualityText;
      }
      element.style.display = "block";
      element.style.opacity = 0.8;
      element.style.filter = `alpha(opacity=${0.8 * 100})`;
      commonUtil.startFadeoutAnimation(element);
    },
    setVideoQuality: function (quality) {
      const moviePlayer = document.getElementById("movie_player");
      if (
        moviePlayer &&
        typeof moviePlayer.setPlaybackQualityRange === "function"
      ) {
        moviePlayer.setPlaybackQualityRange(quality, quality);
      }
    },
    videoObserver: function () {
      const checkPlayerInterval = setInterval(() => {
        const moviePlayer = document.getElementById("movie_player");
        if (moviePlayer && typeof moviePlayer.addEventListener === "function") {
          clearInterval(checkPlayerInterval);

          const setBestQuality = () => {
            const availableQualities = moviePlayer.getAvailableQualityData();
            if (availableQualities && availableQualities.length > 0) {
              const bestQuality = availableQualities.find((q) => q.isPlayable);
              if (bestQuality) {
                this.setVideoQuality(bestQuality.quality);
                this.currentQuality = bestQuality.quality;
                const qualityBtn = document.querySelector(
                  ".QualityControl_Extension_Btn_X span"
                );
                if (qualityBtn) {
                  qualityBtn.textContent = bestQuality.qualityLabel;
                }
              }
            }
          };

          moviePlayer.addEventListener("onPlaybackQualityChange", (quality) => {
            if (!quality) return;
            this.currentQuality = quality;
            const qualityBtn = document.querySelector(
              ".QualityControl_Extension_Btn_X span"
            );
            if (qualityBtn) {
              const qualityLabel =
                moviePlayer
                  .getAvailableQualityData()
                  .find((q) => q.quality === quality)?.qualityLabel || quality;
              qualityBtn.textContent = qualityLabel;
            }
          });

          // Set best quality on initial load
          setBestQuality();

          // Also set best quality when a new video is loaded in the same player
          moviePlayer.addEventListener("onStateChange", (state) => {
            if (
              state === 1 /* PLAYING */ &&
              moviePlayer.getPlaybackQuality() !== this.currentQuality
            ) {
              // A new video has likely started, re-apply best quality
              setTimeout(setBestQuality, 500); // Delay to allow quality data to be available
            }
          });
        }
      }, 500);
    },
  };

  /*!
   * credit to Benjamin Philipp
   * MIT
   * original source: https://greasyfork.org/en/scripts/433051-trusted-types-helper
   */
  const overwrite_default = false;
  const passThroughFunc = function (string, sink) {
    return string;
  };
  var TTPName = "passthrough";
  var TTP_default,
    TTP = {
      createHTML: passThroughFunc,
      createScript: passThroughFunc,
      createScriptURL: passThroughFunc,
    };
  var needsTrustedHTML = false;
  !window.TTP &&
    (() => {
      try {
        if (
          typeof window.isSecureContext !== "undefined" &&
          window.isSecureContext
        ) {
          if (window.trustedTypes && window.trustedTypes.createPolicy) {
            needsTrustedHTML = true;
            if (trustedTypes.defaultPolicy) {
              if (overwrite_default);
              else {
                TTP = window.trustedTypes.createPolicy(TTPName, TTP);
              }
              TTP_default = trustedTypes.defaultPolicy;
            } else {
              TTP_default = TTP = window.trustedTypes.createPolicy(
                "default",
                TTP
              );
            }
          }
        }
      } catch (e) {
      } finally {
        window.TTP = TTP;
      }
    })();

  (async () => {
    await SpeedControl.run();
    await LoopControl.run();
    await QualityControl.run();
  })();
})();
