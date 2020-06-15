var Swear;
(function (Swear) {
    var App = /** @class */ (function () {
        function App() {
            this.videoUrl = null;
            this.subtitleUrl = null;
            console.log('parsing swear word list');
            this.filter = new Filter();
            this.fileSelector = new FileSelector(this.init, this);
        }
        App.prototype.init = function () {
            var reader = new FileReader();
            var self = this;
            reader.onload = function () {
                console.log('parsing subtitles');
                self.subtitles = new Subtitles();
                self.subtitles.createFromSrt(reader.result, self.filter);
                console.log('generating download link');
                self.downloadSrt(self.subtitles.getContent());
                console.log('generating ffmpeg mute command');
                self.displayCommand(self.subtitles.timestamps);
            };
            reader.readAsText(this.fileSelector.subtitles);
        };
        App.prototype.downloadSrt = function (data) {
            var blob = new Blob([data], { type: 'text/srt' });
            var fileName = 'swear.srt';
            var objectUrl = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = objectUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(objectUrl);
        };
        App.prototype.displayCommand = function (timestamps) {
            var command = 'ffmpeg -af "';
            var volumeChanges = [];
            for (var i = 0; i < timestamps.length; i++) {
                var timestamp = timestamps[i];
                var start = timestamp['start'];
                var end = timestamp['end'];
                // Mute audio if we are within 1 second of the timestamp
                volumeChanges.push("volume=enable='between(t," + start.time + "," + (end.time + 1) + ")':volume=0");
            }
            command += volumeChanges.join(',') + '" -i [INPUT] -vf subtitles=[SWEAR-SRT] [OUTPUT]';
            document.getElementById("command-results").style.display = "block";
            var t = document.getElementById('command');
            t.innerText = command;
        };
        App.swearListPath = 'words.txt';
        return App;
    }());
    Swear.App = App;
    var Filter = /** @class */ (function () {
        function Filter() {
            this.list = [];
            this.list = swearWords;
        }
        Filter.prototype.removeSwearWords = function (content) {
            for (var i = 0; i < this.list.length; i++) {
                var word = this.list[i];
                var censored = word.replace(/./g, '*');
                content = content.replace(new RegExp('\\b' + word + '\\b', 'gi'), censored);
            }
            return content;
        };
        return Filter;
    }());
    Swear.Filter = Filter;
    var SwearListReadException = /** @class */ (function () {
        function SwearListReadException(filePath) {
            this.name = 'SwearListReadException';
            this.message = "Failed to read the swear list: '" + filePath + "'";
        }
        return SwearListReadException;
    }());
    Swear.SwearListReadException = SwearListReadException;
    SwearListReadException.prototype = Error.prototype;
    var Subtitles = /** @class */ (function () {
        function Subtitles() {
            this._timestamps = [];
            this._content = '';
            this._subtitleCount = 1;
        }
        Subtitles.prototype.getContent = function () {
            return this._content;
        };
        Subtitles.prototype.createFromSrt = function (content, filter) {
            var result = [];
            var timestamps = [];
            var rows = content.split('\n');
            var formattedTimestamp = "";
            var start = null;
            var end = null;
            var subtitle = [];
            var lastSubtitleSwore = false;
            var previousSubtitle = [];
            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                if (row.match(/(.*):(.*):(.*),(.*) --> (.*):(.*):(.*),(.*)/g) !== null) {
                    formattedTimestamp = row.replace(/,/g, '.');
                    var parts = row.split(' --> ');
                    start = new Timestamp(parts[0]);
                    end = new Timestamp(parts[1]);
                }
                else if (row.trim() == '' && subtitle.length > 0) { // Empty row
                    // Filter out swearing
                    var completeSubtitle = subtitle.join("\n");
                    var cleanSubtitle = filter.removeSwearWords(completeSubtitle);
                    // Only add subtitles which contained swearing
                    if (cleanSubtitle !== completeSubtitle) {
                        // Add the previous subtitle in case that line gets muted early
                        if (previousSubtitle.length === 4) {
                            result.push(String(this._subtitleCount++));
                            result.push(previousSubtitle[1]);
                            result.push(previousSubtitle[2]);
                            result.push(previousSubtitle[3]);
                        }
                        timestamps.push({ 'start': start, 'end': end, 'content': cleanSubtitle });
                        result.push(String(this._subtitleCount++));
                        result.push(formattedTimestamp);
                        result.push(cleanSubtitle);
                        result.push("");
                        lastSubtitleSwore = true;
                        previousSubtitle = [];
                    }
                    else {
                        if (lastSubtitleSwore) {
                            // Add next subtitle in case this line is still muted
                            result.push(String(this._subtitleCount++));
                            result.push(formattedTimestamp);
                            result.push(cleanSubtitle);
                            result.push("");
                        }
                        previousSubtitle = [];
                        previousSubtitle.push("");
                        previousSubtitle.push(formattedTimestamp);
                        previousSubtitle.push(cleanSubtitle);
                        previousSubtitle.push("");
                        lastSubtitleSwore = false;
                    }
                    formattedTimestamp = '';
                    start = null;
                    end = null;
                    subtitle = [];
                }
                else if (start !== null && end !== null) {
                    subtitle.push(row);
                }
            }
            this._timestamps = timestamps;
            this._content = result.join("\n");
            console.log(this._timestamps.length + " swear words filtered");
        };
        Object.defineProperty(Subtitles.prototype, "content", {
            get: function () {
                return this._content;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Subtitles.prototype, "timestamps", {
            get: function () {
                return this._timestamps;
            },
            enumerable: true,
            configurable: true
        });
        return Subtitles;
    }());
    Swear.Subtitles = Subtitles;
    var FileSelector = /** @class */ (function () {
        function FileSelector(initCallback, scope) {
            this._video = null;
            this._subtitles = null;
            this.scope = scope;
            this.initCallback = initCallback;
            var dropZone = document.getElementById('drop-zone');
            dropZone.addEventListener('dragover', this.handleDragOver);
            var self = this;
            dropZone.addEventListener('drop', function (event) {
                self.handleFileSelect.call(self, event);
            });
        }
        FileSelector.prototype.initCallback = function () {
        };
        FileSelector.prototype.handleDragOver = function (event) {
            event.stopPropagation();
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
        };
        FileSelector.prototype.handleFileSelect = function (event) {
            event.stopPropagation();
            event.preventDefault();
            var files = event.dataTransfer.files;
            for (var i = 0; i < files.length; i++) {
                var file = files[i];
                var extension = file.name.split('.').pop().toLowerCase();
                if (FileSelector.allowedVideoExtensions.indexOf(extension) >= 0) {
                    this._video = file;
                    // todo: upload
                }
                else if (FileSelector.allowedSubtitleExtensions.indexOf(extension) >= 0) {
                    this._subtitles = file;
                    // todo: upload
                }
            }
            if (this._subtitles != null) {
                document.getElementById('file-subtitles').innerHTML = this._subtitles.name;
            }
            if (this._subtitles != null) {
                document.getElementById('start-button').className = document.getElementById('start-button').className.replace(' disabled', '');
                var self = this;
                document.getElementById('start-button').addEventListener('click', function () {
                    self.initCallback.call(self.scope);
                });
            }
        };
        Object.defineProperty(FileSelector.prototype, "video", {
            get: function () {
                return this._video;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(FileSelector.prototype, "subtitles", {
            get: function () {
                return this._subtitles;
            },
            enumerable: true,
            configurable: true
        });
        FileSelector.allowedVideoExtensions = ['mp4', 'mkv'];
        FileSelector.allowedSubtitleExtensions = ['srt'];
        return FileSelector;
    }());
    Swear.FileSelector = FileSelector;
    var Timestamp = /** @class */ (function () {
        function Timestamp(timestamp) {
            this._hours = 0;
            this._minutes = 0;
            this._seconds = 0;
            // Timestamp in seconds
            this._time = 0;
            var parts = timestamp.split(':');
            if (parts.length != 3) {
                throw new InvalidTimestampException(timestamp);
            }
            this._hours = parseInt(parts[0]);
            this._minutes = parseInt(parts[1]);
            this._seconds = parseFloat(parts[2]);
            this._time = ((this._hours * 60) * 60) + (this._minutes * 60) + this._seconds;
        }
        Object.defineProperty(Timestamp.prototype, "hours", {
            get: function () {
                return this._hours;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Timestamp.prototype, "minutes", {
            get: function () {
                return this._minutes;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Timestamp.prototype, "seconds", {
            get: function () {
                return this._seconds;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Timestamp.prototype, "time", {
            get: function () {
                return this._time;
            },
            enumerable: true,
            configurable: true
        });
        return Timestamp;
    }());
    Swear.Timestamp = Timestamp;
    var InvalidTimestampException = /** @class */ (function () {
        function InvalidTimestampException(timestamp) {
            this.name = 'InvalidTimestampException';
            this.message = "Invalid subtitle timestamp: '" + timestamp + "'";
        }
        return InvalidTimestampException;
    }());
    Swear.InvalidTimestampException = InvalidTimestampException;
    InvalidTimestampException.prototype = Error.prototype;
})(Swear || (Swear = {}));
var swearApp = new Swear.App();
